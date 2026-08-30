/**
 * BRC-100 broadcast via @1sat/actions. Isolated so unit tests can import
 * yours.ts without Node choking on @1sat's extensionless ESM.
 *
 * Same stack as SatPress / AI Bounties: createContext(isBaseWallet: false),
 * then wallet.createAction, with sendBsv.execute as a fallback.
 */
import { createContext, sendBsv, type OneSatContext } from "@1sat/actions";
import { OneSatServices } from "@1sat/client";
import type { ChainAnchor, ChainNetwork } from "./types";
import { lookupHeight, yoursSendAttempts } from "./yours";

const services = new OneSatServices("main");

export function buildContext(wallet: NonNullable<OneSatContext["wallet"]>): OneSatContext {
  return createContext(wallet, {
    chain: "main",
    services,
    isBaseWallet: false,
  });
}

const WALLET_CALL_TIMEOUT_MS = 180_000;

class WalletTimeoutError extends Error {
  constructor(readonly stage: string) {
    super(`wallet-timeout:${stage}`);
    this.name = "WalletTimeoutError";
  }
}

function withTimeout<T>(p: Promise<T>, stage: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new WalletTimeoutError(stage)), WALLET_CALL_TIMEOUT_MS);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

function wrapWalletError(err: unknown, verb: string): string {
  const raw = err instanceof Error ? err.message : String(err ?? "Unknown error");
  const lower = raw.toLowerCase();
  if (
    lower.includes("user-rejected") ||
    lower.includes("reject") ||
    lower.includes("denied") ||
    lower.includes("cancel") ||
    lower.includes("closed")
  ) {
    return `${verb} was rejected in Yours Wallet.`;
  }
  if (lower.includes("insufficient-funds") || lower.includes("insufficient") || lower.includes("not enough")) {
    return "Yours Wallet does not have enough BSV to broadcast this transaction.";
  }
  if (lower.includes("storage-payment-failed") || lower.includes("storage")) {
    return "Yours Wallet remote storage needs a top-up before broadcasting.";
  }
  if (lower.includes("not-connected") || lower.includes("locked")) {
    return "Unlock Yours Wallet and connect it to WitnessCam.";
  }
  return raw || `${verb} failed in Yours Wallet.`;
}

async function recoverTimedOutTxid(
  wallet: NonNullable<OneSatContext["wallet"]>,
  descriptionPrefix: string,
): Promise<string | null> {
  try {
    if (!wallet.listActions) return null;
    const { actions } = await wallet.listActions({ labels: [], limit: 10 });
    const match = (actions ?? []).find(
      (a) =>
        a.isOutgoing &&
        typeof a.description === "string" &&
        a.description.startsWith(descriptionPrefix) &&
        (a.status === "completed" || a.status === "unproven") &&
        a.txid,
    );
    return match?.txid ? String(match.txid).toLowerCase() : null;
  } catch {
    return null;
  }
}

type FetchLike = typeof fetch;

export async function broadcastBrc100(
  scriptHex: string,
  wallet: unknown,
  identityKey: string | null,
  fetchImpl: FetchLike,
): Promise<ChainAnchor> {
  const ctx = buildContext(wallet as NonNullable<OneSatContext["wallet"]>);
  const prefix = "WitnessCam OP_RETURN";
  const uniqueOutputs = yoursSendAttempts(scriptHex)
    .map((req) => req[0])
    .filter((item): item is { satoshis: number; script: string } => Boolean(item.script))
    .filter(
      (o, i, all) =>
        all.findIndex((x) => x.satoshis === o.satoshis && x.script === o.script) === i,
    );

  let lastError = "Yours Wallet did not return a txid";
  let txid = "";

  for (const out of uniqueOutputs) {
    try {
      const result = await withTimeout(
        ctx.wallet.createAction({
          description: "WitnessCam OP_RETURN seal",
          outputs: [
            {
              satoshis: out.satoshis,
              lockingScript: out.script,
              outputDescription: "WC1 content hash + custody tip",
            },
          ],
          options: { acceptDelayedBroadcast: false, randomizeOutputs: false },
        }),
        "createAction",
      );
      const got = String(result.txid || "");
      if (got.length >= 32) {
        txid = got.toLowerCase();
        break;
      }
      lastError = "Yours Wallet did not return a txid";
    } catch (caught) {
      lastError = wrapWalletError(caught, "Seal");
      if (caught instanceof WalletTimeoutError) {
        const recovered = await recoverTimedOutTxid(ctx.wallet, prefix);
        if (recovered) {
          txid = recovered;
          break;
        }
      }
      if (/reject|denied|cancel|closed/i.test(lastError)) break;
    }
  }

  if (!txid) {
    try {
      const sent = await withTimeout(
        sendBsv.execute(ctx, { requests: yoursSendAttempts(scriptHex)[0] }),
        "sendBsv",
      );
      if (sent.error) lastError = wrapWalletError(new Error(sent.error), "Seal");
      else if (sent.txid && sent.txid.length >= 32) txid = sent.txid.toLowerCase();
    } catch (caught) {
      lastError = wrapWalletError(caught, "Seal");
    }
  }

  if (!txid || txid.length < 32) throw new Error(lastError);

  const network: ChainNetwork = "bsv";
  return {
    network,
    source: "yours",
    opReturnHex: scriptHex,
    payloadAsciiPrefix: "WC1",
    txid,
    blockHeight: await lookupHeight(txid, network, fetchImpl),
    anchoredAt: new Date().toISOString(),
    address: identityKey ?? undefined,
  };
}
