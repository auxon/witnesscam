import { useWallet } from "../lib/wallet";
import { YOURS_EXTENSION_URL } from "../lib/yours";

export function WalletChip() {
  const { extension, sidecar, connected, address, source, connect, busy } = useWallet();

  if (connected && source === "yours") {
    const short = address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "Yours";
    return (
      <button className="chip chip-live" title={address ?? "Yours Wallet"}>
        BSV · {short}
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

  if (extension && !connected) {
    return (
      <button className="chip" disabled={busy} onClick={() => void connect()}>
        {busy ? "Connecting…" : "Connect Yours"}
      </button>
    );
  }

  return (
    <a className="chip" href={YOURS_EXTENSION_URL} target="_blank" rel="noreferrer">
      Get Yours
    </a>
  );
}
