import { sha256Hex } from "./bytes";
import type { CustodyEvent, CustodyEventType } from "./types";

export const GENESIS_PREV =
  "0000000000000000000000000000000000000000000000000000000000000000";

export function serializeEventBody(
  event: Omit<CustodyEvent, "eventHash">,
): string {
  const metaKeys = Object.keys(event.meta).sort();
  const meta = metaKeys.map((k) => `${k}=${event.meta[k]}`).join("&");
  return [
    event.prevHash,
    event.type,
    event.at,
    event.actorId,
    event.actorName,
    event.contentHash,
    meta,
  ].join("|");
}

export async function hashEvent(
  event: Omit<CustodyEvent, "eventHash">,
): Promise<string> {
  return sha256Hex(new TextEncoder().encode(serializeEventBody(event)));
}

export async function appendEvent(params: {
  prevHash: string;
  type: CustodyEventType;
  at?: string;
  actorId: string;
  actorName: string;
  contentHash: string;
  meta?: Record<string, string>;
}): Promise<CustodyEvent> {
  const body: Omit<CustodyEvent, "eventHash"> = {
    prevHash: params.prevHash,
    type: params.type,
    at: params.at ?? new Date().toISOString(),
    actorId: params.actorId,
    actorName: params.actorName,
    contentHash: params.contentHash,
    meta: params.meta ?? {},
  };
  const eventHash = await hashEvent(body);
  return { ...body, eventHash };
}

export async function verifyChain(
  events: CustodyEvent[],
): Promise<{ ok: true } | { ok: false; index: number; reason: string }> {
  let prev = GENESIS_PREV;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (event.prevHash !== prev) {
      return { ok: false, index: i, reason: "broken prevHash link" };
    }
    const expected = await hashEvent({
      prevHash: event.prevHash,
      type: event.type,
      at: event.at,
      actorId: event.actorId,
      actorName: event.actorName,
      contentHash: event.contentHash,
      meta: event.meta,
    });
    if (expected !== event.eventHash) {
      return { ok: false, index: i, reason: "eventHash mismatch" };
    }
    prev = event.eventHash;
  }
  return { ok: true };
}

export function chainTip(events: CustodyEvent[]): string {
  if (events.length === 0) return GENESIS_PREV;
  return events[events.length - 1].eventHash;
}
