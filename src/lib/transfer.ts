import { mineAnchor } from "./chain";
import { appendEvent, chainTip } from "./custody";
import { nextBlockHeight } from "./device";
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

  const height = nextBlockHeight();
  const anchor = await mineAnchor(
    bag.contentHash,
    transferred.eventHash,
    height,
  );

  const timestamped = await appendEvent({
    prevHash: transferred.eventHash,
    type: "TIMESTAMPED",
    actorId: "chain.bsv-demo",
    actorName: "BSV demo miner",
    contentHash: bag.contentHash,
    meta: {
      txid: anchor.txid,
      blockHeight: String(anchor.blockHeight),
      opReturn: anchor.opReturnHex,
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
