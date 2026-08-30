import { stampAndAnchor } from "./chain";
import { appendEvent, chainTip } from "./custody";
import { updateBag } from "./storage";
import type { EvidenceBag } from "./types";

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

  const { rfc3161, anchor } = await stampAndAnchor(bag.contentHash, transferred.eventHash);

  const timestamped = await appendEvent({
    prevHash: transferred.eventHash,
    type: "TIMESTAMPED",
    actorId: `tsa:${rfc3161.tsa}`,
    actorName: `${rfc3161.tsa} (RFC 3161)`,
    contentHash: bag.contentHash,
    meta: {
      rfc3161: "1",
      tsa: rfc3161.tsa,
      genTime: rfc3161.genTime,
      serial: rfc3161.serial,
      txid: anchor.txid,
      network: anchor.network,
      source: anchor.source || "none",
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
    rfc3161,
  };
  await updateBag(next);
  return next;
}
