import {
  FREE_SEAL_LIMIT,
  LICENSE_COOKIE,
  PRO_PRICE_CENTS,
  PRO_PRODUCT_NAME,
} from "./constants";
import { verifyStripeWebhook } from "./stripeSignature";

export { FREE_SEAL_LIMIT };

const COOKIE_PATH = "/witnesscam";

export type LicenseKv = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number },
  ): Promise<void>;
};

export type BillingEnv = {
  LICENSES: LicenseKv;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
};

type LicenseRecord = {
  token: string;
  deviceId: string;
  customerId: string;
  subscriptionId: string;
  email: string;
  status: string;
  grantedAt: string;
  updatedAt?: string;
};

type StripeObject = {
  id?: string;
  url?: string;
  status?: string;
  customer?: string;
  subscription?: string;
  client_reference_id?: string;
  customer_email?: string;
  customer_details?: { email?: string | null };
  metadata?: { deviceId?: string };
  data?: { object?: StripeObject };
  type?: string;
};

export async function handleBilling(
  request: Request,
  env: BillingEnv,
  strippedPath: string,
): Promise<Response | null> {
  if (!strippedPath.startsWith("/api/")) return null;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors() });
  }

  if (strippedPath === "/api/entitlement" && request.method === "GET") {
    return json(await readEntitlement(request, env));
  }

  if (strippedPath === "/api/checkout" && request.method === "POST") {
    return createCheckout(request, env);
  }

  if (strippedPath === "/api/claim" && request.method === "GET") {
    return claimCheckout(request, env);
  }

  if (strippedPath === "/api/portal" && request.method === "POST") {
    return createPortal(request, env);
  }

  if (strippedPath === "/api/webhook" && request.method === "POST") {
    return handleWebhook(request, env);
  }

  return json({ error: "not found" }, 404);
}

function cors(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
  };
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...cors(), ...extra },
  });
}

function originOf(request: Request) {
  return new URL(request.url).origin;
}

function cookieHeader(token: string) {
  return `${LICENSE_COOKIE}=${token}; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=31536000`;
}

function readCookie(request: Request) {
  const raw = request.headers.get("Cookie") || "";
  const hit = raw
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${LICENSE_COOKIE}=`));
  return hit ? hit.slice(LICENSE_COOKIE.length + 1) : "";
}

async function stripeForm(
  env: BillingEnv,
  path: string,
  params: Record<string, string>,
): Promise<StripeObject> {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const data = (await res.json()) as StripeObject & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data?.error?.message || `Stripe ${res.status}`);
  }
  return data;
}

async function stripeGet(env: BillingEnv, path: string): Promise<StripeObject> {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` },
  });
  const data = (await res.json()) as StripeObject & {
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(data?.error?.message || `Stripe ${res.status}`);
  }
  return data;
}

function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function existingToken(
  env: BillingEnv,
  license: Partial<LicenseRecord>,
) {
  if (license.token) return license.token;
  const keys: string[] = [];
  if (license.customerId) keys.push(`customer:${license.customerId}`);
  if (license.subscriptionId) keys.push(`sub:${license.subscriptionId}`);
  if (license.deviceId) keys.push(`device:${license.deviceId}`);
  for (const key of keys) {
    const hit = await env.LICENSES.get(key);
    if (hit) return hit;
  }
  return "";
}

function parseLicense(raw: string | null): LicenseRecord | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LicenseRecord;
  } catch {
    return null;
  }
}

async function grant(
  env: BillingEnv,
  license: Partial<LicenseRecord>,
): Promise<LicenseRecord> {
  const token = (await existingToken(env, license)) || newToken();
  const prev = parseLicense(await env.LICENSES.get(`lic:${token}`)) || {
    token,
    deviceId: "",
    customerId: "",
    subscriptionId: "",
    email: "",
    status: "active",
    grantedAt: new Date().toISOString(),
  };
  const record: LicenseRecord = {
    token,
    deviceId: license.deviceId || prev.deviceId || "",
    customerId: license.customerId || prev.customerId || "",
    subscriptionId: license.subscriptionId || prev.subscriptionId || "",
    email: license.email || prev.email || "",
    status: license.status || prev.status || "active",
    grantedAt: prev.grantedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const writes: Promise<void>[] = [
    env.LICENSES.put(`lic:${token}`, JSON.stringify(record)),
  ];
  if (record.deviceId) writes.push(env.LICENSES.put(`device:${record.deviceId}`, token));
  if (record.customerId) {
    writes.push(env.LICENSES.put(`customer:${record.customerId}`, token));
  }
  if (record.subscriptionId) {
    writes.push(env.LICENSES.put(`sub:${record.subscriptionId}`, token));
  }
  await Promise.all(writes);
  return record;
}

async function revokeBySubscription(env: BillingEnv, subscriptionId: string) {
  const token = await env.LICENSES.get(`sub:${subscriptionId}`);
  if (!token) return;
  const rec = parseLicense(await env.LICENSES.get(`lic:${token}`));
  if (rec) {
    rec.status = "canceled";
    await env.LICENSES.put(`lic:${token}`, JSON.stringify(rec));
  }
}

async function readEntitlement(request: Request, env: BillingEnv) {
  const url = new URL(request.url);
  const deviceId = url.searchParams.get("deviceId") || "";
  const token = readCookie(request);
  let rec = parseLicense(token ? await env.LICENSES.get(`lic:${token}`) : null);
  if (!rec && deviceId) {
    const mapped = await env.LICENSES.get(`device:${deviceId}`);
    rec = parseLicense(mapped ? await env.LICENSES.get(`lic:${mapped}`) : null);
  }
  const pro = rec?.status === "active";
  return {
    pro,
    status: rec?.status || "free",
    email: rec?.email || null,
    freeLimit: FREE_SEAL_LIMIT,
    configured: Boolean(env.STRIPE_SECRET_KEY),
  };
}

async function createCheckout(request: Request, env: BillingEnv) {
  try {
    const body = (await request.json().catch(() => ({}))) as { deviceId?: string };
    const deviceId = String(body.deviceId || "").slice(0, 80);
    if (!deviceId) return json({ error: "deviceId required" }, 400);
    const origin = originOf(request);
    const session = await stripeForm(env, "checkout/sessions", {
      mode: "subscription",
      success_url: `${origin}${COOKIE_PATH}/api/claim?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${COOKIE_PATH}/#/`,
      client_reference_id: deviceId,
      "metadata[deviceId]": deviceId,
      "subscription_data[metadata][deviceId]": deviceId,
      allow_promotion_codes: "true",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(PRO_PRICE_CENTS),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]": PRO_PRODUCT_NAME,
      "line_items[0][price_data][product_data][description]":
        "Unlimited sealed evidence bags. Pixels never leave your browser.",
    });
    return json({ url: session.url, id: session.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "checkout failed";
    const status = msg.includes("STRIPE_SECRET_KEY") ? 503 : 400;
    return json({ error: msg }, status);
  }
}

async function claimCheckout(request: Request, env: BillingEnv) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("session_id") || "";
  const fail = `${originOf(request)}${COOKIE_PATH}/?billing=failed#/`;
  const ok = `${originOf(request)}${COOKIE_PATH}/?billing=pro#/`;
  if (!sessionId.startsWith("cs_")) {
    return Response.redirect(fail, 302);
  }
  try {
    const session = await stripeGet(
      env,
      `checkout/sessions/${encodeURIComponent(sessionId)}`,
    );
    if (session.status !== "complete") {
      return Response.redirect(fail, 302);
    }
    const record = await grant(env, {
      deviceId: session.client_reference_id || session.metadata?.deviceId || "",
      customerId: String(session.customer || ""),
      subscriptionId: String(session.subscription || ""),
      email: session.customer_details?.email || session.customer_email || "",
      status: "active",
    });
    return new Response(null, {
      status: 302,
      headers: {
        Location: ok,
        "Set-Cookie": cookieHeader(record.token),
      },
    });
  } catch {
    return Response.redirect(fail, 302);
  }
}

async function createPortal(request: Request, env: BillingEnv) {
  try {
    const entitlement = await readEntitlement(request, env);
    const token = readCookie(request);
    if (!token) return json({ error: "no license" }, 401);
    const rec = parseLicense(await env.LICENSES.get(`lic:${token}`));
    if (!rec) return json({ error: "no license" }, 401);
    if (!rec.customerId) return json({ error: "no customer" }, 400);
    const returnUrl = `${originOf(request)}${COOKIE_PATH}/#/`;
    let portal: StripeObject;
    try {
      portal = await stripeForm(env, "billing_portal/sessions", {
        customer: rec.customerId,
        return_url: returnUrl,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (!/portal|configuration/i.test(msg)) throw err;
      const config = await stripeForm(env, "billing_portal/configurations", {
        "business_profile[headline]": PRO_PRODUCT_NAME,
        "features[invoice_history][enabled]": "true",
        "features[payment_method_update][enabled]": "true",
        "features[subscription_cancel][enabled]": "true",
        "features[subscription_cancel][mode]": "at_period_end",
        "features[customer_update][enabled]": "true",
        "features[customer_update][allowed_updates][0]": "email",
      });
      portal = await stripeForm(env, "billing_portal/sessions", {
        customer: rec.customerId,
        return_url: returnUrl,
        configuration: String(config.id || ""),
      });
    }
    return json({ url: portal.url, pro: entitlement.pro });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "portal failed" },
      400,
    );
  }
}

async function handleWebhook(request: Request, env: BillingEnv) {
  const payload = await request.text();
  const sig = request.headers.get("Stripe-Signature") || "";
  const ok = await verifyStripeWebhook(
    payload,
    sig,
    env.STRIPE_WEBHOOK_SECRET || "",
  );
  if (!ok) return json({ error: "invalid signature" }, 400);

  let event: StripeObject;
  try {
    event = JSON.parse(payload) as StripeObject;
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  if (event.id) {
    const seen = await env.LICENSES.get(`event:${event.id}`);
    if (seen) return json({ received: true, duplicate: true });
    await env.LICENSES.put(`event:${event.id}`, "1", {
      expirationTtl: 60 * 60 * 24 * 30,
    });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object || {};
    await grant(env, {
      deviceId: session.client_reference_id || session.metadata?.deviceId || "",
      customerId: String(session.customer || ""),
      subscriptionId: String(session.subscription || ""),
      email: session.customer_details?.email || session.customer_email || "",
      status: "active",
    });
  }

  if (
    event.type === "customer.subscription.deleted" ||
    event.type === "customer.subscription.updated"
  ) {
    const sub = event.data?.object || {};
    const status = sub.status;
    if (status === "canceled" || status === "unpaid" || status === "incomplete_expired") {
      if (sub.id) await revokeBySubscription(env, sub.id);
    } else if ((status === "active" || status === "trialing") && sub.id) {
      const token = await env.LICENSES.get(`sub:${sub.id}`);
      const rec = parseLicense(token ? await env.LICENSES.get(`lic:${token}`) : null);
      if (rec && token) {
        rec.status = "active";
        await env.LICENSES.put(`lic:${token}`, JSON.stringify(rec));
      }
    }
  }

  return json({ received: true });
}
