import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyStripeWebhook } from "./stripeSignature";

describe("verifyStripeWebhook", () => {
  const secret = "whsec_test_secret";
  const payload = '{"id":"evt_1","type":"checkout.session.completed"}';

  function header(payloadText: string, ts: number): string {
    const v1 = createHmac("sha256", secret).update(`${ts}.${payloadText}`).digest("hex");
    return `t=${ts},v1=${v1}`;
  }

  it("accepts a valid Stripe-Signature header", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    expect(await verifyStripeWebhook(payload, header(payload, timestamp), secret)).toBe(
      true,
    );
  });

  it("rejects a tampered payload", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    expect(
      await verifyStripeWebhook(payload + "x", header(payload, timestamp), secret),
    ).toBe(false);
  });

  it("rejects a stale timestamp", async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 400;
    expect(await verifyStripeWebhook(payload, header(payload, timestamp), secret, 300)).toBe(
      false,
    );
  });

  it("rejects a missing header or secret", async () => {
    expect(await verifyStripeWebhook(payload, null as unknown as string, secret)).toBe(
      false,
    );
    expect(await verifyStripeWebhook(payload, "t=1,v1=abc", "")).toBe(false);
  });
});
