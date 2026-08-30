import { describe, expect, it, vi } from "vitest";
import {
  explorerTxUrl,
  normalizeNetwork,
  pickAddress,
  probeWallet,
  broadcastOpReturn,
} from "./yours";

describe("Yours helpers", () => {
  it("normalizes mainnet and testnet labels", () => {
    expect(normalizeNetwork("mainnet")).toBe("bsv");
    expect(normalizeNetwork("main")).toBe("bsv");
    expect(normalizeNetwork("testnet")).toBe("bsv-test");
    expect(normalizeNetwork({ network: "test" })).toBe("bsv");
  });

  it("picks a BSV address from the provider payload", () => {
    expect(pickAddress({ bsvAddress: "1BoatSLRHtKNngkdXEeobR76b53LETtpyT" })).toBe(
      "1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
    );
    expect(pickAddress(["1BoatSLRHtKNngkdXEeobR76b53LETtpyT"])).toBe(
      "1BoatSLRHtKNngkdXEeobR76b53LETtpyT",
    );
  });

  it("builds a WhatsOnChain URL only for live networks", () => {
    expect(explorerTxUrl("bsv-demo", "ab".repeat(32))).toBeNull();
    expect(explorerTxUrl("bsv", "ab".repeat(32))).toContain("whatsonchain.com/tx/");
    expect(explorerTxUrl("bsv-test", "ab".repeat(32))).toContain("test.whatsonchain.com");
  });
});

describe("broadcastOpReturn", () => {
  it("sends the OP_RETURN script through window.yours", async () => {
    const sendBsv = vi.fn(async () => ({ txid: "cd".repeat(32) }));
    const win = {
      yours: {
        connect: vi.fn(),
        isConnected: vi.fn(async () => true),
        getAddresses: vi.fn(async () => ({ bsvAddress: "1BoatSLRHtKNngkdXEeobR76b53LETtpyT" })),
        getNetwork: vi.fn(async () => "mainnet"),
        sendBsv,
      },
      location: { protocol: "https:", hostname: "entangleit.com" },
    } as unknown as Window;
    const fetchImpl = vi.fn(async () => new Response("{}", { status: 404 }));
    const anchor = await broadcastOpReturn("6a43" + "aa".repeat(67), win, fetchImpl as unknown as typeof fetch);
    expect(anchor?.source).toBe("yours");
    expect(anchor?.network).toBe("bsv");
    expect(anchor?.txid).toHaveLength(64);
    expect(sendBsv).toHaveBeenCalledWith([{ satoshis: 1, script: "6a43" + "aa".repeat(67) }]);
  });

  it("returns null when no wallet is present", async () => {
    const win = {
      location: { protocol: "https:", hostname: "entangleit.com" },
    } as unknown as Window;
    const fetchImpl = vi.fn();
    expect(await broadcastOpReturn("6a43", win, fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("detects a sidecar only on localhost http", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ version: "1" }), { status: 200 }),
    );
    const local = {
      location: { protocol: "http:", hostname: "localhost" },
    } as unknown as Window;
    const remote = {
      location: { protocol: "https:", hostname: "entangleit.com" },
    } as unknown as Window;
    const a = await probeWallet(local, fetchImpl as unknown as typeof fetch);
    const b = await probeWallet(remote, fetchImpl as unknown as typeof fetch);
    expect(a.sidecar).toBe(true);
    expect(a.source).toBe("yours-agent");
    expect(b.sidecar).toBe(false);
    expect(b.source).toBe("none");
  });
});
