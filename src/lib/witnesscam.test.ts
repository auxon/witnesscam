import { describe, expect, it } from "vitest";
import { encodeOpReturn, decodeOpReturn, mineAnchor, PAYLOAD_PREFIX } from "./chain";
import {
  GENESIS_PREV,
  appendEvent,
  chainTip,
  verifyChain,
} from "./custody";

describe("OP_RETURN encoding", () => {
  it("round-trips a 67-byte WitnessCam payload", () => {
    const contentHash = "a".repeat(64);
    const tip = "b".repeat(64);
    const script = encodeOpReturn(contentHash, tip);
    expect(script.startsWith("6a43")).toBe(true);
    expect(script.length).toBe((2 + 67) * 2);
    const decoded = decodeOpReturn(script);
    expect(decoded.contentHash).toBe(contentHash);
    expect(decoded.chainTip).toBe(tip);
  });

  it("rejects a non OP_RETURN script", () => {
    expect(() => decodeOpReturn("00")).toThrow(/not an OP_RETURN/);
  });
});

describe("custody hash chain", () => {
  it("links events and detects tampering", async () => {
    const contentHash = "c".repeat(64);
    const a = await appendEvent({
      prevHash: GENESIS_PREV,
      type: "CAPTURED",
      actorId: "H1",
      actorName: "Alice",
      contentHash,
      meta: { deviceId: "DEV-1" },
    });
    const b = await appendEvent({
      prevHash: a.eventHash,
      type: "HASHED",
      actorId: "H1",
      actorName: "Alice",
      contentHash,
      meta: { alg: "SHA-256" },
    });
    const ok = await verifyChain([a, b]);
    expect(ok).toEqual({ ok: true });
    expect(chainTip([a, b])).toBe(b.eventHash);

    const tampered = { ...b, meta: { alg: "MD5" } };
    const broken = await verifyChain([a, tampered]);
    expect(broken.ok).toBe(false);
  });

  it("detects a broken prevHash link", async () => {
    const contentHash = "d".repeat(64);
    const a = await appendEvent({
      prevHash: GENESIS_PREV,
      type: "CAPTURED",
      actorId: "H1",
      actorName: "Alice",
      contentHash,
    });
    const b = await appendEvent({
      prevHash: "e".repeat(64),
      type: "ENCRYPTED",
      actorId: "H1",
      actorName: "Alice",
      contentHash,
    });
    const broken = await verifyChain([a, b]);
    expect(broken).toMatchObject({ ok: false, reason: "broken prevHash link" });
  });
});

describe("demo miner", () => {
  it("commits content hash and tip into the script", async () => {
    const contentHash = "f".repeat(64);
    const tip = "1".repeat(64);
    const anchor = await mineAnchor(contentHash, tip, 914401);
    expect(anchor.payloadAsciiPrefix).toBe(PAYLOAD_PREFIX);
    expect(anchor.network).toBe("bsv-demo");
    expect(anchor.txid).toHaveLength(64);
    const decoded = decodeOpReturn(anchor.opReturnHex);
    expect(decoded.contentHash).toBe(contentHash);
    expect(decoded.chainTip).toBe(tip);
  });
});
