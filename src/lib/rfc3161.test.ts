import { describe, expect, it } from "vitest";
import { encodeTimeStampReq, parseAsn1Time, randomNonce } from "./rfc3161";
import { parseDerRoot } from "./der";

describe("RFC 3161 request", () => {
  it("encodes a SHA-256 TimeStampReq", () => {
    const hash = "ab".repeat(32);
    const der = encodeTimeStampReq(hash, randomNonce());
    expect(der[0]).toBe(0x30);
    const root = parseDerRoot(der);
    expect(root.children.length).toBe(4);
    expect(root.children[0].tag).toBe(0x02);
    expect(root.children[3].tag).toBe(0x01);
  });

  it("parses GeneralizedTime and UTCTime", () => {
    expect(parseAsn1Time("20260830184500Z")).toBe("2026-08-30T18:45:00.000Z");
    expect(parseAsn1Time("260830184500Z")).toBe("2026-08-30T18:45:00.000Z");
  });
});

describe("public TSA", () => {
  it.skipIf(!process.env.RUN_TSA)("returns a parseable RFC 3161 token", async () => {
    const { requestRfc3161 } = await import("./timestamp");
    const stamp = await requestRfc3161("ab".repeat(32));
    expect(stamp.tsa).toMatch(/DigiCert|Sectigo|FreeTSA/);
    expect(stamp.hashedMessage).toBe("ab".repeat(32));
    expect(stamp.tokenB64.length).toBeGreaterThan(80);
    expect(stamp.genTime).toMatch(/^\d{4}-/);
  });
});
