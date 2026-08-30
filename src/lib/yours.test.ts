import { describe, expect, it, vi } from "vitest";
import {
  explorerTxUrl,
  normalizeNetwork,
  pickAddress,
  probeWallet,
  broadcastOpReturn,
  opReturnPayloadHex,
  yoursSendAttempts,
  syncFromProvider,
  getWalletStatus,
  getActiveWallet,
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

  it("treats idle disconnected as available, not missing (CWI / SatPress)", () => {
    syncFromProvider({
      status: "disconnected",
      wallet: null,
      identityKey: null,
      hasProviders: false,
    });
    expect(getWalletStatus()).toBe("available");
    expect(getActiveWallet()).toBeNull();
  });

  it("treats selecting after a failed CWI race as available, not connecting", () => {
    syncFromProvider({
      status: "selecting",
      wallet: null,
      identityKey: null,
      hasProviders: true,
    });
    expect(getWalletStatus()).toBe("available");
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
    expect(sendBsv).toHaveBeenCalledWith([{ satoshis: 0, script: "6a43" + "aa".repeat(67) }]);
  });

  it("retries 0-sat OP_FALSE and data if 1-sat script is rejected", async () => {
    const script = "6a43" + "aa".repeat(67);
    const sendBsv = vi.fn(async (req: { satoshis: number; script?: string; data?: string[] }[]) => {
      if (req[0]?.satoshis === 1 && req[0]?.script) return { error: "invalid request" };
      if (req[0]?.script && !req[0].script.startsWith("00")) return { error: "dust" };
      return { txid: "ef".repeat(32) };
    });
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
    const anchor = await broadcastOpReturn(script, win, fetchImpl as unknown as typeof fetch);
    expect(anchor?.txid).toHaveLength(64);
    expect(sendBsv.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(sendBsv.mock.calls[0][0][0]).toEqual({ satoshis: 0, script });
  });

  it("strips OP_RETURN opcodes from the payload hex", () => {
    const payload = "aa".repeat(67);
    expect(opReturnPayloadHex("6a43" + payload)).toBe(payload);
    expect(opReturnPayloadHex("006a43" + payload)).toBe(payload);
    expect(yoursSendAttempts("6a43" + payload)[2][0].data).toEqual([payload]);
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
