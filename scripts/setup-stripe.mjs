#!/usr/bin/env node
/**
 * Creates the WitnessCam webhook and a Customer Portal configuration.
 *
 *   STRIPE_SECRET_KEY=sk_test_… node scripts/setup-stripe.mjs
 *
 * Then put both secrets on the Worker:
 *
 *   npx wrangler secret put STRIPE_SECRET_KEY
 *   npx wrangler secret put STRIPE_WEBHOOK_SECRET
 */
const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Set STRIPE_SECRET_KEY (sk_test_… or sk_live_…).");
  process.exit(1);
}

const WEBHOOK_URL = "https://entangleit.com/witnesscam/api/webhook";
const events = [
  "checkout.session.completed",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

async function stripe(path, params) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || JSON.stringify(json));
  }
  return json;
}

async function stripeGet(path) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || JSON.stringify(json));
  }
  return json;
}

const existing = await stripeGet("webhook_endpoints?limit=100");
let webhook = (existing.data || []).find((w) => w.url === WEBHOOK_URL);
if (webhook) {
  console.log("webhook already exists:", webhook.id);
  console.log("secret: (already created — copy it from Dashboard → Developers → Webhooks)");
} else {
  const body = { url: WEBHOOK_URL, description: "WitnessCam Pro licenses" };
  events.forEach((event, i) => {
    body[`enabled_events[${i}]`] = event;
  });
  webhook = await stripe("webhook_endpoints", body);
  console.log("webhook id:", webhook.id);
  console.log("webhook secret:", webhook.secret);
}

try {
  const portal = await stripe("billing_portal/configurations", {
    "business_profile[headline]": "WitnessCam Pro",
    "features[invoice_history][enabled]": "true",
    "features[payment_method_update][enabled]": "true",
    "features[subscription_cancel][enabled]": "true",
    "features[subscription_cancel][mode]": "at_period_end",
    "features[customer_update][enabled]": "true",
    "features[customer_update][allowed_updates][0]": "email",
  });
  console.log("portal configuration:", portal.id);
} catch (err) {
  console.log("portal configuration:", err instanceof Error ? err.message : err);
}

console.log("\nNext:");
console.log("  npx wrangler secret put STRIPE_SECRET_KEY");
console.log("  npx wrangler secret put STRIPE_WEBHOOK_SECRET");
console.log("Use a test key first. Card 4242… completes Checkout without charging.");
