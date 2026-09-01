import { describe, expect, it } from "vitest";
import { appendEvent, GENESIS_PREV } from "./custody";
import { buildCustodyCertificate } from "./auditExport";
import type { EvidenceBag } from "./types";

describe("counsel certificate", () => {
  it("explains RFC 3161 without requiring a cryptocurrency", async () => {
    const captured = await appendEvent({
      prevHash: GENESIS_PREV,
      type: "CAPTURED",
      actorId: "H1",
      actorName: "Ada",
      contentHash: "aa".repeat(32),
    });
    const bag: EvidenceBag = {
      id: "WC-TEST-0001",
      kind: "still",
      mimeType: "image/jpeg",
      byteLength: 12,
      capturedAt: "2026-08-30T18:00:00.000Z",
      contentHash: "aa".repeat(32),
      ciphertextHash: "bb".repeat(32),
      ivHex: "cc".repeat(12),
      deviceId: "DEV-1",
      deviceLabel: "lab",
      holderId: "H1",
      holderName: "Ada",
      events: [captured],
      chainTip: captured.eventHash,
      filename: "scene.jpg",
      anchor: {
        network: "none",
        source: "none",
        opReturnHex: "6a43" + "aa".repeat(67),
        payloadAsciiPrefix: "WC1",
        txid: "",
        blockHeight: 0,
        anchoredAt: "2026-08-30T18:00:01.000Z",
      },
      rfc3161: {
        tsa: "DigiCert",
        tsaUrl: "http://timestamp.digicert.com",
        hashedMessage: "aa".repeat(32),
        genTime: "2026-08-30T18:00:01.000Z",
        tokenB64: "QQ==",
        serial: "01",
        status: 0,
      },
    };
    const html = await buildCustodyCertificate(bag);
    expect(html).toContain("RFC 3161");
    expect(html).toContain("DigiCert");
    expect(html).toContain("does not need to explain a cryptocurrency");
    expect(html).not.toContain("<script");
  });

  it("shows situation and scene label for counsel", async () => {
    const captured = await appendEvent({
      prevHash: GENESIS_PREV,
      type: "CAPTURED",
      actorId: "H1",
      actorName: "Ada",
      contentHash: "aa".repeat(32),
      meta: { presetId: "landlord", situation: "Landlord", sceneLabel: "Apt hallway" },
    });
    const bag: EvidenceBag = {
      id: "WC-TEST-0002",
      kind: "still",
      mimeType: "image/jpeg",
      byteLength: 12,
      capturedAt: "2026-08-30T18:00:00.000Z",
      contentHash: "aa".repeat(32),
      ciphertextHash: "bb".repeat(32),
      ivHex: "cc".repeat(12),
      deviceId: "DEV-1",
      deviceLabel: "lab",
      holderId: "H1",
      holderName: "Ada",
      situation: "Landlord",
      presetId: "landlord",
      sceneLabel: "Apt hallway",
      events: [captured],
      chainTip: captured.eventHash,
      filename: "scene.jpg",
      anchor: {
        network: "none",
        source: "none",
        opReturnHex: "6a43" + "aa".repeat(67),
        payloadAsciiPrefix: "WC1",
        txid: "",
        blockHeight: 0,
        anchoredAt: "2026-08-30T18:00:01.000Z",
      },
    };
    const html = await buildCustodyCertificate(bag);
    expect(html).toContain("Landlord");
    expect(html).toContain("Apt hallway");
    expect(html).toContain("Situation");
    expect(html).toContain("Scene label");
  });
});
