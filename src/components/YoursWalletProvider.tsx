import { useEffect, type ReactNode } from "react";
import { WalletProvider, useWallet } from "@1sat/react";
import { registerConnect, syncFromProvider } from "../lib/yours";

function YoursBridge({ children }: { children: ReactNode }) {
  const { wallet, status, identityKey, connect } = useWallet();

  useEffect(() => {
    registerConnect(() => connect());
  }, [connect]);

  useEffect(() => {
    // Yours BRC-100 uses CWI / extension messaging, not window.yours.
    // SatPress always treats idle disconnected as "available" (Connect),
    // never "extension missing". @1sat/connect auto-detects via CWI.
    syncFromProvider({
      status,
      wallet: wallet ?? null,
      identityKey: identityKey ?? null,
      hasProviders: true,
    });
  }, [status, wallet, identityKey]);

  useEffect(() => {
    function onEvent(e: Event) {
      const action = (e as CustomEvent<{ action?: string }>).detail?.action;
      if (action === "signedOut") {
        syncFromProvider({
          status: "disconnected",
          wallet: null,
          identityKey: null,
          hasProviders: true,
        });
      }
    }
    window.addEventListener("YoursEmitEvent", onEvent);
    return () => window.removeEventListener("YoursEmitEvent", onEvent);
  }, []);

  return <>{children}</>;
}

/** BRC-100 WalletProvider. Auto-detects Yours via CWI (`@1sat/connect`). */
export function YoursWalletProvider({ children }: { children: ReactNode }) {
  return (
    <WalletProvider autoReconnect autoDetect>
      <YoursBridge>{children}</YoursBridge>
    </WalletProvider>
  );
}
