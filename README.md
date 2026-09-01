# WitnessCam

Record. Encrypt on-device. Hash. Timestamp. Hand the bag like a lab sample.

This is the first slice of the WitnessCam idea: a browser instrument that seals a still or a 15-second clip the way a DNA lab seals a sample. Plaintext never leaves the device. The public artifact is a SHA-256 digest, a custody hash chain, and a Bitcoin-style OP_RETURN script.

## Loop

1. **Capture** — camera still, 15s video, file upload, or a generated sample still (for machines without a camera). Tag a **situation preset** (Landlord, Delivery, Roadside, Workplace, Night walk, Other) so counsel sees the scene. **Panic** is one tap: record 15s if the camera is live, otherwise Phone camera / Sample still, then the same on-device seal.
2. **Encrypt** — AES-256-GCM in WebCrypto. The key stays in IndexedDB on this origin.
3. **Hash** — SHA-256 of the original bytes. That digest is the identity of the evidence.
4. **Timestamp** — An RFC 3161 Time Stamp Authority (DigiCert, then Sectigo, then FreeTSA) attests the SHA-256. That is the clock of record. Yours Wallet may add a public BSV bulletin. Without a TSA the seal fails — we do not invent a timestamp for counsel.
5. **Transfer** — append a `TRANSFERRED` event, re-stamp the new tip.
6. **Verify / counsel export** — drop the original file and/or the public proof JSON. Print a chain-of-custody certificate (HTML + `.tsr` token) that a lawyer can read without explaining a cryptocurrency.

## Run

```bash
npm install
npm test
npm run dev
```

Open `http://localhost:5173/witnesscam/`. Pick **Landlord** (or another preset), use **Sample still** if the camera is blocked, then **Seal evidence**. Or tap **Panic** — with no camera it offers Sample still and auto-seals. Situation shows on the bag, locker row, and **Print audit for counsel**. Copy the verify link or download `WC-….proof.json`.

```bash
npm run test:e2e   # needs the dev server and Chrome
```

## Situation presets and Panic

Presets are metadata only. They do not change AES-256-GCM, SHA-256, RFC 3161, or the custody hash chain. The last-used preset is stored in `localStorage` on this device.

| Preset | Default scene label |
| --- | --- |
| Landlord | Apt hallway |
| Delivery | Porch delivery |
| Roadside | Roadside stop |
| Workplace | Workplace |
| Night walk | Night walk |
| Other | (free-text situation label) |

**Panic** respects the free-tier paywall (3 seals/device). If no preset is selected it uses the last-used chip, or **Night walk**. Media still never leaves the browser.

## Deploy (Cloudflare)

WitnessCam is a Worker with static assets, mounted on the existing `entangleit.com` zone at `/witnesscam*` so the portfolio SPA and `/ASLTutor/` keep their Pages project.

```bash
npm run deploy
```

That builds with `base: /witnesscam/` and runs `wrangler deploy`. The Worker strips the prefix before serving `dist/`. Live URL: https://entangleit.com/witnesscam/

## Stripe

Free tier is **3 sealed bags** per device. After that, **WitnessCam Pro is $9/month** via Stripe Checkout and covers the **organization** (every field phone that joined with the desk code). Evidence still never leaves the browser.

If you charge US or EU customers, enable [Stripe Tax](https://docs.stripe.com/billing/taxes/collect-taxes.md) in the Dashboard after you have an active tax registration — Checkout will not collect tax until that exists.

Checkout creates the Pro price inline (`price_data`), so you do not need a Dashboard product first. Use a test key (`sk_test_…`) and card `4242 4242 4242 4242` until the loop is proven.

```bash
# registers webhook + customer portal, prints STRIPE_WEBHOOK_SECRET
STRIPE_SECRET_KEY=sk_test_… node scripts/setup-stripe.mjs

npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

Webhook endpoint: `https://entangleit.com/witnesscam/api/webhook`

Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.

Without those secrets the Worker still serves the app. The paywall shows “Stripe is not configured” and `/api/checkout` returns 503.

## Organizations and field phones

Create a desk under **Org**. Read the join code to a phone. That phone Add-to-Home-Screens the PWA (`Phone camera` uses the OS capture sheet — iOS does not like `getUserMedia` until the user taps). Pro is licensed to the org, not a single browser cookie.

## Counsel timestamp (RFC 3161)

The Worker `POST /api/timestamp` sends only the SHA-256 to a public Time Stamp Authority. The bag stores the token. **Print audit for counsel** emits HTML plus a `.tsr` file. Bitcoin SV is optional and labeled as a public bulletin, not the timestamp of record.

## Yours Wallet

Live stamps go through [Yours](https://yours.org) / [auxon/yours-agent](https://github.com/auxon/yours-agent):

1. `@1sat/react` `WalletProvider` (`autoReconnect` + `autoDetect`) — BRC-100 / CWI. Current Yours does **not** inject `window.yours`; that legacy panda API is a fallback only. Click **Connect Yours**.
2. Agent sidecar on `http://127.0.0.1:3321` — only from `http://localhost` (HTTPS pages cannot call the sidecar).
3. Demo miner if neither is connected.

The locking script is the existing 67-byte `WC1` payload. Yours gets a 0-sat `script` first, then `OP_FALSE OP_RETURN`, then the `data` path, then a 1-sat fallback — some builds reject a 1-sat OP_RETURN.

## What is demo vs real

| Piece | This build | Production |
| --- | --- | --- |
| Capture / encrypt / hash / custody chain | Real, in-browser | Same |
| OP_RETURN script | Real encoding | Same |
| Timestamp | RFC 3161 TSA (DigiCert / Sectigo); optional Yours bulletin | Same |
| Block height / txid | TSA genTime always; WhatsOnChain if Yours broadcast | Bitcoin SV optional |
| Storage | IndexedDB on this origin | Holder-controlled bag + optional encrypted object store |

## Stack

Vite, React, TypeScript, WebCrypto, IndexedDB. No backend. No analytics. No upload of media.
