import { anchorEvidence } from "./chain";
import { appendEvent, chainTip } from "./custody";
import { updateBag } from "./storage";
import type { EvidenceBag } from "./types";
import { chainActor } from "./yours";

export async function transferCustody(
  bag: EvidenceBag,
  toName: string,
  note: string,
): Promise<EvidenceBag> {
  const name = toName.trim();
  if (!name) throw new Error("Recipient name is required");

  const transferred = await appendEvent({
    prevHash: bag.chainTip,
    type: "TRANSFERRED",
    actorId: bag.holderId,
    actorName: bag.holderName,
    contentHash: bag.contentHash,
    meta: {
      from: bag.holderName,
      to: name,
      note: note.trim() || "custody handoff",
    },
  });

  const anchor = await anchorEvidence(bag.contentHash, transferred.eventHash);
  const miner = chainActor(anchor);

  const timestamped = await appendEvent({
    prevHash: transferred.eventHash,
    type: "TIMESTAMPED",
    actorId: miner.actorId,
    actorName: miner.actorName,
    contentHash: bag.contentHash,
    meta: {
      txid: anchor.txid,
      blockHeight: String(anchor.blockHeight),
      opReturn: anchor.opReturnHex,
      network: anchor.network,
      source: anchor.source || "demo",
      reason: "transfer",
    },
  });

  const holderId = `HLD-${Array.from(crypto.getRandomValues(new Uint8Array(3)), (b) => b.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  const events = [...bag.events, transferred, timestamped];

  const next: EvidenceBag = {
    ...bag,
    holderName: name,
    holderId,
    events,
    chainTip: chainTip(events),
    anchor,
  };
  await updateBag(next);
  return next;
}
