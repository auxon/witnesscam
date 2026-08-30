import type { ChainAnchor, ChainNetwork, ChainSource } from "./types";

export const YOURS_EXTENSION_URL =
  "https://chromewebstore.google.com/detail/yours-wallet/mlbnicldlpdimbjdcncnklfempedeipj";
export const YOURS_SITE = "https://yours.org";
export const YOURS_AGENT_REPO = "https://github.com/auxon/yours-agent";
export const SIDECAR_URL = "http://127.0.0.1:3321";

export type YoursSendRequest = {
  satoshis: number;
  address?: string;
  script?: string;
  data?: string[];
};

export type YoursProvider = {
  isReady?: boolean;
  connect: () => Promise<unknown>;
  isConnected: () => Promise<boolean>;
  getAddresses: () => Promise<unknown>;
  getNetwork: () => Promise<unknown>;
  sendBsv: (req: YoursSendRequest[]) => Promise<{
    txid?: string;
    rawtx?: string;
    error?: string;
  }>;
};

export type WalletProbe = {
  extension: boolean;
  sidecar: boolean;
  connected: boolean;
  address: string | null;
  network: ChainNetwork | null;
  source: ChainSource | "none";
};

type FetchLike = typeof fetch;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function getYours(win: Window = window): YoursProvider | null {
  const w = win as Window & { yours?: YoursProvider; panda?: YoursProvider };
  return w.yours ?? w.panda ?? null;
}

export function normalizeNetwork(raw: unknown): ChainNetwork {
  const s = String(raw ?? "").toLowerCase();
  if (s.includes("test")) return "bsv-test";
  return "bsv";
}

export function pickAddress(raw: unknown): string | null {
  if (typeof raw === "string" && raw.length > 8) return raw;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0];
  const rec = asRecord(raw);
  if (!rec) return null;
  for (const key of ["bsvAddress", "identityAddress", "ordAddress", "address"]) {
    const v = rec[key];
    if (typeof v === "string" && v.length > 8) return v;
  }
  return null;
}

export function explorerTxUrl(network: ChainNetwork, txid: string): string | null {
  if (network === "bsv-demo" || !txid) return null;
  const host =
    network === "bsv-test" ? "https://test.whatsonchain.com" : "https://whatsonchain.com";
  return `${host}/tx/${txid}`;
}

export function chainActor(anchor: ChainAnchor): { actorId: string; actorName: string } {
  if (anchor.source === "yours") {
    return {
      actorId: anchor.address || "yours",
      actorName: "Yours Wallet",
    };
  }
  if (anchor.source === "yours-agent") {
    return { actorId: "yours-agent", actorName: "Yours agent sidecar" };
  }
  return { actorId: "chain.bsv-demo", actorName: "BSV demo miner" };
}

function sidecarAllowed(win: Window = window): boolean {
  const { protocol, hostname } = win.location;
  return protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1");
}

async function sidecarCall(
  method: string,
  body: Record<string, unknown>,
  fetchImpl: FetchLike = fetch,
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(`${SIDECAR_URL}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      Originator: "http://localhost",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = asRecord(json.error) ?? json;
    throw new Error(String((err as { message?: string }).message || json.error || `sidecar ${res.status}`));
  }
  return json;
}

export async function sidecarUp(
  fetchImpl: FetchLike = fetch,
  win: Window = window,
): Promise<boolean> {
  if (!sidecarAllowed(win)) return false;
  try {
    const json = await sidecarCall("getVersion", {}, fetchImpl);
    return Boolean(json.version || json.result || json);
  } catch {
    return false;
  }
}

async function lookupHeight(
  txid: string,
  network: ChainNetwork,
  fetchImpl: FetchLike = fetch,
): Promise<number> {
  const chain = network === "bsv-test" ? "test" : "main";
  try {
    const res = await fetchImpl(
      `https://api.whatsonchain.com/v1/bsv/${chain}/tx/hash/${txid}`,
    );
    if (!res.ok) return 0;
    const json = (await res.json()) as { blockheight?: number; blockhash?: string };
    return Number(json.blockheight) > 0 ? Number(json.blockheight) : 0;
  } catch {
    return 0;
  }
}

async function fromExtension(
  scriptHex: string,
  provider: YoursProvider,
  fetchImpl: FetchLike = fetch,
): Promise<ChainAnchor> {
  const connected = await provider.isConnected().catch(() => false);
  if (!connected) await provider.connect();
  const still = await provider.isConnected().catch(() => true);
  if (!still) throw new Error("Yours Wallet is not connected");

  const [addresses, networkRaw] = await Promise.all([
    provider.getAddresses().catch(() => null),
    provider.getNetwork().catch(() => "mainnet"),
  ]);
  const network = normalizeNetwork(networkRaw);
  const address = pickAddress(addresses);

  const sent = await provider.sendBsv([{ satoshis: 1, script: scriptHex }]);
  if (sent?.error) throw new Error(sent.error);
  const txid = sent?.txid;
  if (!txid || txid.length < 32) throw new Error("Yours Wallet did not return a txid");

  return {
    network,
    source: "yours",
    opReturnHex: scriptHex,
    payloadAsciiPrefix: "WC1",
    txid,
    blockHeight: await lookupHeight(txid, network, fetchImpl),
    anchoredAt: new Date().toISOString(),
    address: address ?? undefined,
  };
}

async function fromSidecar(
  scriptHex: string,
  fetchImpl: FetchLike,
): Promise<ChainAnchor> {
  const result = await sidecarCall(
    "createAction",
    {
      description: "WitnessCam OP_RETURN seal",
      outputs: [
        {
          lockingScript: scriptHex,
          satoshis: 1,
          outputDescription: "WC1 content hash + custody tip",
        },
      ],
    },
    fetchImpl,
  );
  const txid = String(
    result.txid ||
      asRecord(result.result)?.txid ||
      "",
  );
  if (txid.length < 32) throw new Error("Yours agent sidecar did not return a txid");
  let network: ChainNetwork = "bsv";
  try {
    const net = await sidecarCall("getNetwork", {}, fetchImpl);
    network = normalizeNetwork(net.network ?? net.result ?? net);
  } catch {
    network = "bsv";
  }
  return {
    network,
    source: "yours-agent",
    opReturnHex: scriptHex,
    payloadAsciiPrefix: "WC1",
    txid,
    blockHeight: await lookupHeight(txid, network, fetchImpl),
    anchoredAt: new Date().toISOString(),
  };
}

export async function probeWallet(
  win: Window = window,
  fetchImpl: FetchLike = fetch,
): Promise<WalletProbe> {
  const provider = getYours(win);
  const sidecar = await sidecarUp(fetchImpl, win);
  if (provider) {
    const connected = await provider.isConnected().catch(() => false);
    let address: string | null = null;
    let network: ChainNetwork | null = null;
    if (connected) {
      const [addresses, networkRaw] = await Promise.all([
        provider.getAddresses().catch(() => null),
        provider.getNetwork().catch(() => "mainnet"),
      ]);
      address = pickAddress(addresses);
      network = normalizeNetwork(networkRaw);
    }
    return {
      extension: true,
      sidecar,
      connected,
      address,
      network,
      source: "yours",
    };
  }
  if (sidecar) {
    return {
      extension: false,
      sidecar: true,
      connected: true,
      address: null,
      network: "bsv",
      source: "yours-agent",
    };
  }
  return {
    extension: false,
    sidecar: false,
    connected: false,
    address: null,
    network: null,
    source: "none",
  };
}

/**
 * Broadcast `scriptHex` (full OP_RETURN locking script) via Yours extension,
 * then the local yours-agent sidecar. Returns null when neither is available
 * so the caller can fall back to the demo miner.
 */
export async function broadcastOpReturn(
  scriptHex: string,
  win: Window = window,
  fetchImpl: FetchLike = fetch,
): Promise<ChainAnchor | null> {
  const provider = getYours(win);
  if (provider) {
    return fromExtension(scriptHex, provider, fetchImpl);
  }
  if (await sidecarUp(fetchImpl, win)) {
    try {
      return await fromSidecar(scriptHex, fetchImpl);
    } catch {
      return null;
    }
  }
  return null;
}
