import { useWallet } from "../lib/wallet";
import { YOURS_EXTENSION_URL, YOURS_SITE } from "../lib/yours";

function shortKey(key: string | null): string {
  if (!key) return "Yours";
  if (key.length < 12) return key;
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}

export function WalletChip() {
  const { connected, sidecar, address, source, phase, connect, busy, error } = useWallet();

  if (connected && source === "yours") {
    return (
      <button className="chip chip-live" title={address ?? "Yours Wallet"}>
        BSV · {shortKey(address)}
      </button>
    );
  }

  if (sidecar) {
    return (
      <button className="chip chip-live" title="yours-agent sidecar on :3321">
        Agent wallet
      </button>
    );
  }

  if (phase === "detecting" || phase === "connecting" || busy) {
    return (
      <button className="chip" disabled>
        {phase === "detecting" ? "Yours…" : "Connecting…"}
      </button>
    );
  }

  return (
    <>
      <button
        className="chip"
        disabled={busy}
        onClick={() => void connect()}
        title={error ?? "Connect Yours Wallet"}
      >
        Connect Yours
      </button>
      <a className="chip" href={YOURS_EXTENSION_URL} target="_blank" rel="noreferrer" title={YOURS_SITE}>
        Get Yours
      </a>
    </>
  );
}
