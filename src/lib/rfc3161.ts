import { concatBytes, fromHex, toHex } from "./bytes";
import {
  encodeBool,
  encodeInteger,
  encodeIntegerBytes,
  encodeNull,
  encodeOctetString,
  encodeOid,
  encodeSequence,
  findOid,
  integerToHex,
  parseDerRoot,
  walk,
  type DerNode,
} from "./der";
import type { Rfc3161Stamp } from "./types";

/** SHA-256 */
const OID_SHA256 = "2.16.840.1.101.3.4.2.1";
/** id-ct-TSTInfo */
const OID_TST_INFO = "1.2.840.113549.1.9.16.1.4";

export const TSA_ENDPOINTS = [
  { name: "DigiCert", url: "http://timestamp.digicert.com" },
  { name: "Sectigo", url: "http://timestamp.sectigo.com" },
  { name: "FreeTSA", url: "https://freetsa.org/tsr" },
] as const;

export function encodeTimeStampReq(sha256Hex: string, nonce: Uint8Array): Uint8Array {
  const hash = fromHex(sha256Hex);
  if (hash.length !== 32) throw new Error("RFC 3161 hashedMessage must be SHA-256 (32 bytes)");
  const alg = encodeSequence(encodeOid(OID_SHA256), encodeNull());
  const imprint = encodeSequence(alg, encodeOctetString(hash));
  return encodeSequence(
    encodeInteger(1),
    imprint,
    encodeIntegerBytes(nonce),
    encodeBool(true),
  );
}

export function parseAsn1Time(raw: string): string {
  const t = raw.trim();
  const gen = t.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z?$/i);
  if (gen) {
    const iso = `${gen[1]}-${gen[2]}-${gen[3]}T${gen[4]}:${gen[5]}:${gen[6]}Z`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) throw new Error("invalid GeneralizedTime");
    return d.toISOString();
  }
  const utc = t.match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.\d+)?Z?$/i);
  if (utc) {
    const yy = Number(utc[1]);
    const year = yy >= 50 ? 1900 + yy : 2000 + yy;
    const iso = `${year}-${utc[2]}-${utc[3]}T${utc[4]}:${utc[5]}:${utc[6]}Z`;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) throw new Error("invalid UTCTime");
    return d.toISOString();
  }
  throw new Error("unrecognized ASN.1 time");
}

function textOf(node: DerNode): string {
  return new TextDecoder("ascii").decode(node.bytes);
}

function firstOctetStringAfter(node: DerNode, oid: string): Uint8Array | null {
  let seen = false;
  let found: Uint8Array | null = null;
  walk(node, (n) => {
    if (found) return;
    if (n.tag === 0x06 && n.bytes && findOid(n, oid) === n) {
      seen = true;
      return;
    }
    if (seen && n.tag === 0x04 && n.bytes.length > 8) {
      found = n.bytes;
    }
  });
  return found;
}

export function parseTimeStampResp(
  der: Uint8Array,
  expectedHashHex: string,
): Omit<Rfc3161Stamp, "tsa" | "tsaUrl" | "tokenB64"> {
  const root = parseDerRoot(der);
  if (root.tag !== 0x10 && root.tag !== 0x00) {
    // SEQUENCE tag is 0x30; we store tag & 0x1f so SEQUENCE is 0x10
  }
  const statusInfo = root.children[0];
  const statusNode = statusInfo?.children[0];
  const status = statusNode ? Number.parseInt(integerToHex(statusNode.bytes) || "0", 16) : 99;
  if (status !== 0 && status !== 1) {
    throw new Error(`TSA rejected the request (PKIStatus ${status})`);
  }

  const tstInfoBytes = firstOctetStringAfter(root, OID_TST_INFO);
  if (!tstInfoBytes) throw new Error("TSA response did not include TSTInfo");
  const tstInfo = parseDerRoot(tstInfoBytes);
  const imprint = tstInfo.children[2];
  const hashed = imprint?.children[1];
  if (!hashed || hashed.tag !== 0x04) throw new Error("TSTInfo missing hashedMessage");
  const hashedMessage = toHex(hashed.bytes);
  if (hashedMessage !== expectedHashHex.toLowerCase()) {
    throw new Error("TSA token hash does not match the evidence digest");
  }
  const serialNode = tstInfo.children[3];
  const serial = serialNode ? integerToHex(serialNode.bytes) : "";
  const timeNode = tstInfo.children[4];
  if (!timeNode || (timeNode.tag !== 0x17 && timeNode.tag !== 0x18)) {
    throw new Error("TSTInfo missing genTime");
  }
  const genTime = parseAsn1Time(textOf(timeNode));
  return {
    hashedMessage,
    genTime,
    serial,
    status,
  };
}

export function randomNonce(bytes = 8): Uint8Array {
  const nonce = crypto.getRandomValues(new Uint8Array(bytes));
  nonce[0] &= 0x7f;
  if (nonce[0] === 0) nonce[0] = 1;
  return nonce;
}

export function encodeNonce(): Uint8Array {
  return randomNonce(8);
}

export { concatBytes };
