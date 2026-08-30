import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  connectYours,
  getIdentityKey,
  getWalletStatus,
  probeWallet,
  subscribeWallet,
  type WalletProbe,
  type WalletStatus,
} from "./yours";

type WalletValue = WalletProbe & {
  phase: WalletStatus;
  refresh: () => Promise<void>;
  connect: () => Promise<void>;
  busy: boolean;
  error: string | null;
};

const WalletContext = createContext<WalletValue | null>(null);

const empty: WalletProbe = {
  extension: false,
  sidecar: false,
  connected: false,
  address: null,
  network: null,
  source: "none",
};

export function WalletProvider({ children }: { children: ReactNode }) {
  const [probe, setProbe] = useState<WalletProbe>(empty);
  const [phase, setPhase] = useState<WalletStatus>(() => getWalletStatus());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const status = getWalletStatus();
      setPhase(status);
      const sidecarProbe = await probeWallet();
      const identity = getIdentityKey();
      const connected = status === "connected";
      setProbe({
        extension: status !== "missing",
        sidecar: sidecarProbe.sidecar,
        connected: connected || sidecarProbe.source === "yours-agent",
        address: identity || sidecarProbe.address,
        network: connected ? "bsv" : sidecarProbe.network,
        source: connected ? "yours" : sidecarProbe.source,
      });
    } catch {
      setProbe(empty);
      setPhase(getWalletStatus());
    }
  }

  useEffect(() => {
    void refresh();
    const unsub = subscribeWallet(() => {
      void refresh();
    });
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(() => void refresh(), 12_000);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      await connectYours();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yours connect failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WalletContext.Provider value={{ ...probe, phase, refresh, connect, busy, error }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet outside provider");
  return ctx;
}
