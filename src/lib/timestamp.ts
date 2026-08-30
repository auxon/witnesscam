import { bytesToBase64 } from "./bytes";
import {
  encodeTimeStampReq,
  parseTimeStampResp,
  randomNonce,
  TSA_ENDPOINTS,
} from "./rfc3161";
import type { Rfc3161Stamp } from "./types";

type FetchLike = typeof fetch;

export async function requestRfc3161(
  sha256Hex: string,
  fetchImpl: FetchLike = fetch,
): Promise<Rfc3161Stamp> {
  const hash = sha256Hex.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error("Timestamp needs a SHA-256 hex digest");
  }
  const nonce = randomNonce(8);
  const query = encodeTimeStampReq(hash, nonce);
  let last = "No time stamp authority answered";
  for (const tsa of TSA_ENDPOINTS) {
    try {
      const body = new Uint8Array(query.byteLength);
      body.set(query);
      const res = await fetchImpl(tsa.url, {
        method: "POST",
        headers: {
          "content-type": "application/timestamp-query",
          accept: "application/timestamp-reply",
        },
        body: body.buffer,
      });
      if (!res.ok) {
        last = `${tsa.name} HTTP ${res.status}`;
        continue;
      }
      const der = new Uint8Array(await res.arrayBuffer());
      const parsed = parseTimeStampResp(der, hash);
      return {
        tsa: tsa.name,
        tsaUrl: tsa.url,
        tokenB64: bytesToBase64(der),
        ...parsed,
      };
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
  }
  throw new Error(
    `Could not obtain an RFC 3161 timestamp (${last}). Counsel needs an independent TSA token — retry when the network is up.`,
  );
}
