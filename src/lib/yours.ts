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

const FATAL_SEND_RE = /user.?reject|denied|invalid.?password|not connected/i;

function sendErrorMessage(sent: { error?: string } | null | undefined, caught?: unknown): string {
  if (sent?.error) return sent.error;
  if (caught instanceof Error) return caught.message;
  if (caught) return String(caught);
  return "";
}

function isFatalSendError(message: string): boolean {
  return FATAL_SEND_RE.test(message);
}

/** Bare OP_RETURN payload hex (no 6a / length prefix). */
export function opReturnPayloadHex(scriptHex: string): string {
  const h = scriptHex.replace(/^0x/i, "").toLowerCase();
  if (h.startsWith("006a")) {
    const rest = h.slice(4);
    if (rest.startsWith("4c") && rest.length >= 6) return rest.slice(4);
    if (rest.length >= 2) return rest.slice(2);
  }
  if (h.startsWith("6a")) {
    const rest = h.slice(2);
    if (rest.startsWith("4c") && rest.length >= 6) return rest.slice(4);
    if (rest.length >= 2) return rest.slice(2);
  }
  return h;
}

/**
 * Yours (auxon/yours-agent) builds OP_RETURN from `data` as
 * `OP_0 OP_RETURN <hex chunks>` and rejects a 1-sat value on a
 * non-spendable script on some builds. Try 0-sat script, then
 * OP_FALSE-prefixed script, then the data path.
 */
export function yoursSendAttempts(scriptHex: string, address?: string | null): YoursSendRequest[][] {
  const payload = opReturnPayloadHex(scriptHex);
  const falseReturn = scriptHex.toLowerCase().startsWith("006a") ? scriptHex : `00${scriptHex}`;
  const attempts: YoursSendRequest[][] = [
    [{ satoshis: 0, script: scriptHex }],
    [{ satoshis: 0, script: falseReturn }],
    [{ satoshis: 0, data: [payload] }],
    [{ satoshis: 1, script: scriptHex }],
  ];
  if (address) {
    attempts.push([{ satoshis: 1, address, data: [payload] }]);
  }
  return attempts;
}

/**
 * Current Yours Wallet talks BRC-100 over CWI (`@1sat/connect`).
 * `window.yours` is the old panda inject and is often absent even when
 * the extension is installed — same bug SatPress / AI Bounties hit.
 */
export type WalletStatus =
  | "detecting"
  | "missing"
  | "available"
  | "connecting"
  | "connected";

let activeWallet: unknown = null;
let identityKey: string | null = null;
let connectFn: (() => Promise<void>) | null = null;
let walletStatus: WalletStatus = "detecting";
const listeners = new Set<() => void>();

function emitWallet() {
  for (const fn of listeners) fn();
}

export function subscribeWallet(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getWalletStatus(): WalletStatus {
  return walletStatus;
}

export function getIdentityKey(): string | null {
  return identityKey;
}

export function getActiveWallet(): unknown {
  return activeWallet;
}

export function registerConnect(fn: () => Promise<void>) {
  connectFn = fn;
}

export async function connectYours(): Promise<void> {
  if (!connectFn) {
    throw new Error("Yours Wallet is not ready yet. Refresh and try again.");
  }
  await connectFn();
  for (let i = 0; i < 50 && walletStatus !== "connected"; i++) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (walletStatus !== "connected") {
    throw new Error(
      "Yours Wallet did not connect. Unlock the extension and allow this site, then try Connect Yours again.",
    );
  }
}

/** Map `@1sat/react` status. Idle `disconnected` is "not connected yet", not "missing". */
export function syncFromProvider(input: {
  status: "disconnected" | "detecting" | "selecting" | "connecting" | "connected";
  wallet: unknown;
  identityKey: string | null;
  hasProviders: boolean;
}) {
  if (input.status === "connected" && input.wallet) {
    activeWallet = input.wallet;
    identityKey = input.identityKey;
    walletStatus = "connected";
  } else {
    activeWallet = null;
    identityKey = null;
    if (input.status === "connecting") {
      walletStatus = "connecting";
    } else if (input.status === "detecting") {
      walletStatus = walletStatus === "connected" ? "available" : "detecting";
    } else {
      // Idle disconnected, or selecting after a failed race: show Connect, not missing.
      walletStatus = "available";
    }
  }
  emitWallet();
}

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

export async function lookupHeight(
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

  let lastError = "Yours Wallet did not return a txid";
  let txid = "";
  for (const req of yoursSendAttempts(scriptHex, address)) {
    try {
      const sent = await provider.sendBsv(req);
      const err = sendErrorMessage(sent);
      if (err) {
        lastError = err;
        if (isFatalSendError(err)) break;
        continue;
      }
      if (sent?.txid && sent.txid.length >= 32) {
        txid = sent.txid;
        break;
      }
      lastError = "Yours Wallet did not return a txid";
    } catch (caught) {
      lastError = sendErrorMessage(null, caught) || lastError;
      if (isFatalSendError(lastError)) break;
    }
  }
  if (!txid || txid.length < 32) throw new Error(lastError);

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
          satoshis: 0,
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
 * Broadcast `scriptHex` (full OP_RETURN locking script) via BRC-100 Yours,
 * then the legacy `window.yours` inject, then the local yours-agent sidecar.
 * Returns null when none of those are available so the caller can fall back
 * to the demo miner.
 */
export async function broadcastOpReturn(
  scriptHex: string,
  win: Window = window,
  fetchImpl: FetchLike = fetch,
): Promise<ChainAnchor | null> {
  const wallet = getActiveWallet();
  if (wallet) {
    const { broadcastBrc100 } = await import("./onesat");
    return broadcastBrc100(scriptHex, wallet, getIdentityKey(), fetchImpl);
  }
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
