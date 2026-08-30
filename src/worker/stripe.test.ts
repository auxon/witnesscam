import { describe, expect, it } from "vitest";
import { handleBilling } from "./stripe";

function memoryKv() {
  const map = new Map<string, string>();
  return {
    get: async (key: string) => map.get(key) ?? null,
    put: async (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("billing routes", () => {
  it("reports an unconfigured free entitlement", async () => {
    const env = { LICENSES: memoryKv(), STRIPE_SECRET_KEY: "" };
    const req = new Request(
      "https://entangleit.com/witnesscam/api/entitlement?deviceId=dev-1",
    );
    const res = await handleBilling(req, env, "/api/entitlement");
    expect(res?.status).toBe(200);
    const body = await res!.json();
    expect(body).toMatchObject({
      pro: false,
      status: "free",
      configured: false,
      freeLimit: 3,
    });
  });

  it("rejects checkout without a device id", async () => {
    const env = { LICENSES: memoryKv(), STRIPE_SECRET_KEY: "sk_test_x" };
    const req = new Request("https://entangleit.com/witnesscam/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const res = await handleBilling(req, env, "/api/checkout");
    expect(res?.status).toBe(400);
  });

  it("returns 503 when Stripe is not configured", async () => {
    const env = { LICENSES: memoryKv() };
    const req = new Request("https://entangleit.com/witnesscam/api/checkout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: "dev-1" }),
    });
    const res = await handleBilling(req, env, "/api/checkout");
    expect(res?.status).toBe(503);
  });

  it("returns 503 from setup-stripe when Stripe is not configured", async () => {
    const env = { LICENSES: memoryKv() };
    const req = new Request("https://entangleit.com/witnesscam/api/setup-stripe", {
      method: "POST",
    });
    const res = await handleBilling(req, env, "/api/setup-stripe");
    expect(res?.status).toBe(503);
  });

  it("ignores non-API paths", async () => {
    const env = { LICENSES: memoryKv() };
    const req = new Request("https://entangleit.com/witnesscam/");
    expect(await handleBilling(req, env, "/")).toBeNull();
  });
});
