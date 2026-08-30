import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  getYours,
  probeWallet,
  YOURS_EXTENSION_URL,
  type WalletProbe,
} from "./yours";

type WalletValue = WalletProbe & {
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setProbe(await probeWallet());
    } catch {
      setProbe(empty);
    }
  }

  useEffect(() => {
    void refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    const id = window.setInterval(() => void refresh(), 12_000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.clearInterval(id);
    };
  }, []);

  async function connect() {
    setBusy(true);
    setError(null);
    try {
      const provider = getYours();
      if (!provider) {
        window.open(YOURS_EXTENSION_URL, "_blank", "noopener,noreferrer");
        return;
      }
      await provider.connect();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Yours connect failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <WalletContext.Provider value={{ ...probe, refresh, connect, busy, error }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet outside provider");
  return ctx;
}
