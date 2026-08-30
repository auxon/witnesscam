import { concatBytes, fromHex, sha256Hex, toHex } from "./bytes";
import type { ChainAnchor } from "./types";

/** ASCII prefix committed in the OP_RETURN payload. */
export const PAYLOAD_PREFIX = "WC1";

/**
 * Build a Bitcoin/BSV OP_RETURN script that commits to the evidence hash
 * and the custody chain tip. Payload is 67 bytes (fits BTC's 80-byte limit).
 *
 * script = OP_RETURN + push( "WC1" || contentHash[32] || chainTip[32] )
 */
export function encodeOpReturn(contentHash: string, chainTipHash: string): string {
  const prefix = new TextEncoder().encode(PAYLOAD_PREFIX);
  const payload = concatBytes(prefix, fromHex(contentHash), fromHex(chainTipHash));
  if (payload.length !== 67) {
    throw new Error(`unexpected payload length ${payload.length}`);
  }
  const script = concatBytes(
    new Uint8Array([0x6a, payload.length]),
    payload,
  );
  return toHex(script);
}

export function decodeOpReturn(scriptHex: string): {
  contentHash: string;
  chainTip: string;
} {
  const bytes = fromHex(scriptHex);
  if (bytes[0] !== 0x6a) throw new Error("not an OP_RETURN");
  const len = bytes[1];
  const payload = bytes.slice(2, 2 + len);
  const prefix = new TextDecoder().decode(payload.slice(0, 3));
  if (prefix !== PAYLOAD_PREFIX) throw new Error("unknown WitnessCam prefix");
  return {
    contentHash: toHex(payload.slice(3, 35)),
    chainTip: toHex(payload.slice(35, 67)),
  };
}

export async function mineAnchor(
  contentHash: string,
  chainTipHash: string,
  height: number,
): Promise<ChainAnchor> {
  const opReturnHex = encodeOpReturn(contentHash, chainTipHash);
  const anchoredAt = new Date().toISOString();
  const txid = await sha256Hex(
    new TextEncoder().encode(`${opReturnHex}|${height}|${anchoredAt}`),
  );
  return {
    network: "bsv-demo",
    opReturnHex,
    payloadAsciiPrefix: PAYLOAD_PREFIX,
    txid,
    blockHeight: height,
    anchoredAt,
  };
}
