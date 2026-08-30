import { anchorEvidence } from "./chain";
import { encryptBytes, generateAesKey, exportKeyB64 } from "./crypto";
import { sha256Hex } from "./bytes";
import { GENESIS_PREV, appendEvent, chainTip } from "./custody";
import { getDevice, holderFromDevice, nextBagId } from "./device";
import { saveBag } from "./storage";
import { chainActor } from "./yours";
import type { EvidenceBag, MediaKind } from "./types";

export type SealProgress =
  | "captured"
  | "encrypted"
  | "hashed"
  | "timestamped"
  | "sealed";

export type SealInput = {
  bytes: ArrayBuffer;
  kind: MediaKind;
  mimeType: string;
  filename: string;
  onProgress?: (step: SealProgress) => void;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sealEvidence(input: SealInput): Promise<EvidenceBag> {
  const { bytes, kind, mimeType, filename, onProgress } = input;
  const device = getDevice();
  const holder = holderFromDevice(device);
  const capturedAt = new Date().toISOString();

  onProgress?.("captured");
  await sleep(280);

  const contentHash = await sha256Hex(bytes);
  const key = await generateAesKey();
  const { ivHex, ciphertext, ciphertextHash } = await encryptBytes(bytes, key);
  onProgress?.("encrypted");
  await sleep(280);

  const bagId = nextBagId(contentHash);
  const captured = await appendEvent({
    prevHash: GENESIS_PREV,
    type: "CAPTURED",
    at: capturedAt,
    actorId: holder.holderId,
    actorName: holder.holderName,
    contentHash,
    meta: {
      deviceId: device.id,
      deviceLabel: device.label,
      mimeType,
      byteLength: String(bytes.byteLength),
      kind,
    },
  });

  const encrypted = await appendEvent({
    prevHash: captured.eventHash,
    type: "ENCRYPTED",
    actorId: holder.holderId,
    actorName: holder.holderName,
    contentHash,
    meta: {
      alg: "AES-256-GCM",
      ivBits: "96",
      ciphertextHash,
    },
  });

  const hashed = await appendEvent({
    prevHash: encrypted.eventHash,
    type: "HASHED",
    actorId: holder.holderId,
    actorName: holder.holderName,
    contentHash,
    meta: { alg: "SHA-256", digest: contentHash },
  });
  onProgress?.("hashed");
  await sleep(280);

  const events = [captured, encrypted, hashed];
  const tipBeforeAnchor = chainTip(events);
  const anchor = await anchorEvidence(contentHash, tipBeforeAnchor);
  const miner = chainActor(anchor);

  const timestamped = await appendEvent({
    prevHash: hashed.eventHash,
    type: "TIMESTAMPED",
    actorId: miner.actorId,
    actorName: miner.actorName,
    contentHash,
    meta: {
      txid: anchor.txid,
      blockHeight: String(anchor.blockHeight),
      opReturn: anchor.opReturnHex,
      network: anchor.network,
      source: anchor.source || "demo",
    },
  });
  events.push(timestamped);
  onProgress?.("timestamped");
  await sleep(320);

  const bag: EvidenceBag = {
    id: bagId,
    kind,
    mimeType,
    byteLength: bytes.byteLength,
    capturedAt,
    contentHash,
    ciphertextHash,
    ivHex,
    deviceId: device.id,
    deviceLabel: device.label,
    holderId: holder.holderId,
    holderName: holder.holderName,
    events,
    chainTip: chainTip(events),
    anchor,
    filename,
  };

  await saveBag(bag, ciphertext, {
    bagId: bag.id,
    keyB64: await exportKeyB64(key),
  });
  onProgress?.("sealed");
  return bag;
}
