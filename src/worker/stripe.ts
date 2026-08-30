import {
  FREE_SEAL_LIMIT,
  LICENSE_COOKIE,
  PRO_PRICE_CENTS,
  PRO_PRODUCT_NAME,
} from "./constants";
import {
  orgLicenseKey,
  publicOrg,
  readOrgForDevice,
} from "./org";
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
  orgId?: string;
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
  metadata?: { deviceId?: string; orgId?: string };
  secret?: string;
  object?: string;
  data?: { object?: StripeObject } | StripeObject[];
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

  if (strippedPath === "/api/setup-stripe" && request.method === "POST") {
    return setupStripe(request, env);
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

async function stripeGetList(env: BillingEnv, path: string): Promise<StripeObject[]> {
  const payload = (await stripeGet(env, path)) as StripeObject & {
    data?: StripeObject[];
  };
  return Array.isArray(payload.data) ? payload.data : [];
}

function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  if (url.hostname.endsWith("workers.dev")) return "https://entangleit.com";
  return url.origin;
}

const WHSEC_KV = "stripe:webhook_secret";
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

async function webhookSecret(env: BillingEnv): Promise<string> {
  if (env.STRIPE_WEBHOOK_SECRET) return env.STRIPE_WEBHOOK_SECRET;
  return (await env.LICENSES.get(WHSEC_KV)) || "";
}

async function ensureWebhook(request: Request, env: BillingEnv): Promise<{
  id: string | null;
  created: boolean;
  error?: string;
}> {
  const existing = await webhookSecret(env);
  const hookUrl = `${publicOrigin(request)}${COOKIE_PATH}/api/webhook`;
  try {
    const listed = await stripeGetList(env, "webhook_endpoints?limit=100");
    const hit = listed.find((h) => h.url === hookUrl);
    if (hit?.id && existing) return { id: hit.id, created: false };
    if (hit?.id && !existing) {
      return {
        id: hit.id,
        created: false,
        error: "webhook exists; signing secret is only returned at creation",
      };
    }
    const params: Record<string, string> = {
      url: hookUrl,
      description: "WitnessCam Pro licenses",
    };
    WEBHOOK_EVENTS.forEach((event, i) => {
      params[`enabled_events[${i}]`] = event;
    });
    const created = await stripeForm(env, "webhook_endpoints", params);
    if (created.secret) await env.LICENSES.put(WHSEC_KV, created.secret);
    return { id: created.id || null, created: true };
  } catch (err) {
    return {
      id: null,
      created: false,
      error: err instanceof Error ? err.message : "webhook setup failed",
    };
  }
}

async function expireProbeSessions(env: BillingEnv): Promise<number> {
  try {
    const sessions = await stripeGetList(env, "checkout/sessions?limit=20");
    let n = 0;
    for (const session of sessions) {
      if (session.client_reference_id !== "setup-1") continue;
      if (session.status && session.status !== "open") continue;
      if (!session.id) continue;
      await stripeForm(env, `checkout/sessions/${session.id}/expire`, {});
      n += 1;
    }
    return n;
  } catch {
    return 0;
  }
}

async function setupStripe(request: Request, env: BillingEnv) {
  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: "STRIPE_SECRET_KEY is not set" }, 503);
  }
  const webhook = await ensureWebhook(request, env);
  const expired = await expireProbeSessions(env);
  return json({
    ok: !webhook.error || Boolean(webhook.id),
    webhook,
    expiredProbeSessions: expired,
  });
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
  if (license.orgId) keys.push(orgLicenseKey(license.orgId));
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
    orgId: "",
    customerId: "",
    subscriptionId: "",
    email: "",
    status: "active",
    grantedAt: new Date().toISOString(),
  };
  const record: LicenseRecord = {
    token,
    deviceId: license.deviceId || prev.deviceId || "",
    orgId: license.orgId || prev.orgId || "",
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
  if (record.orgId) writes.push(env.LICENSES.put(orgLicenseKey(record.orgId), token));
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
  const org = await readOrgForDevice(env.LICENSES, deviceId);
  if (org) {
    const orgToken = await env.LICENSES.get(orgLicenseKey(org.id));
    const orgRec = parseLicense(orgToken ? await env.LICENSES.get(`lic:${orgToken}`) : null);
    if (orgRec?.status === "active") rec = orgRec;
  }
  const pro = rec?.status === "active";
  return {
    pro,
    status: rec?.status || "free",
    email: rec?.email || null,
    freeLimit: FREE_SEAL_LIMIT,
    configured: Boolean(env.STRIPE_SECRET_KEY),
    org: org ? publicOrg(org, deviceId) : null,
  };
}

async function createCheckout(request: Request, env: BillingEnv) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      deviceId?: string;
      orgId?: string;
    };
    const deviceId = String(body.deviceId || "").slice(0, 80);
    const orgId = String(body.orgId || "").slice(0, 80);
    if (!deviceId) return json({ error: "deviceId required" }, 400);
    const origin = originOf(request);
    await ensureWebhook(request, env);
    const session = await stripeForm(env, "checkout/sessions", {
      mode: "subscription",
      success_url: `${origin}${COOKIE_PATH}/api/claim?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${COOKIE_PATH}/#/org`,
      client_reference_id: orgId || deviceId,
      "metadata[deviceId]": deviceId,
      "metadata[orgId]": orgId,
      "subscription_data[metadata][deviceId]": deviceId,
      "subscription_data[metadata][orgId]": orgId,
      allow_promotion_codes: "true",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(PRO_PRICE_CENTS),
      "line_items[0][price_data][recurring][interval]": "month",
      "line_items[0][price_data][product_data][name]": PRO_PRODUCT_NAME,
      "line_items[0][price_data][product_data][description]":
        "Organization license: unlimited seals, RFC 3161 timestamps, counsel export. Pixels never leave the browser.",
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
      deviceId: session.metadata?.deviceId || session.client_reference_id || "",
      orgId: session.metadata?.orgId || "",
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
    await webhookSecret(env),
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
    const session =
      (event.data && !Array.isArray(event.data) ? event.data.object : undefined) ||
      {};
    await grant(env, {
      deviceId: session.metadata?.deviceId || "",
      orgId: session.metadata?.orgId || "",
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
    const sub =
      (event.data && !Array.isArray(event.data) ? event.data.object : undefined) ||
      {};
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
