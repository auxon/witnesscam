/**
 * Stripe HMAC for checkout.session webhooks.
 * Stripe-Signature: t=<unix>,v1=<hex>
 */
export async function verifyStripeWebhook(
  payload: string,
  signatureHeader: string,
  secret: string,
  toleranceSec = 300,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const parts: { t?: string; v1?: string[] } = {};
  for (const item of signatureHeader.split(",")) {
    const [k, v] = item.split("=");
    if (!k || !v) continue;
    if (k === "v1") {
      parts.v1 = parts.v1 || [];
      parts.v1.push(v);
    } else if (k === "t") {
      parts.t = v;
    }
  }
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || !parts.v1?.length) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > toleranceSec) return false;

  const signed = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signed),
  );
  const computed = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return parts.v1.some((sig) => timingSafeEqual(sig, computed));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
