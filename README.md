# WitnessCam

Record. Encrypt on-device. Hash. Timestamp. Hand the bag like a lab sample.

This is the first slice of the WitnessCam idea: a browser instrument that seals a still or a 15-second clip the way a DNA lab seals a sample. Plaintext never leaves the device. The public artifact is a SHA-256 digest, a custody hash chain, and a Bitcoin-style OP_RETURN script.

## Loop

1. **Capture** — camera still, 15s video, file upload, or a generated sample still (for machines without a camera).
2. **Encrypt** — AES-256-GCM in WebCrypto. The key stays in IndexedDB on this origin.
3. **Hash** — SHA-256 of the original bytes. That digest is the identity of the evidence.
4. **Timestamp** — Yours Wallet (or the yours-agent sidecar) broadcasts `OP_RETURN WC1 || contentHash || custodyTip` to BSV. Without a wallet, the same script is mined locally so the loop still runs.
5. **Transfer** — append a `TRANSFERRED` event, re-commit the new tip.
6. **Verify** — drop the original file and/or the public proof JSON. No pixels required to check the chain.

## Run

```bash
npm install
npm test
npm run dev
```

Open `http://localhost:5173/witnesscam/`. Use **Sample still** if the camera is blocked, then **Seal evidence**. Copy the verify link or download `WC-….proof.json`.

```bash
npm run test:e2e   # needs the dev server and Chrome
```

## Deploy (Cloudflare)

WitnessCam is a Worker with static assets, mounted on the existing `entangleit.com` zone at `/witnesscam*` so the portfolio SPA and `/ASLTutor/` keep their Pages project.

```bash
npm run deploy
```

That builds with `base: /witnesscam/` and runs `wrangler deploy`. The Worker strips the prefix before serving `dist/`. Live URL: https://entangleit.com/witnesscam/

## Stripe

Free tier is **3 sealed bags** per device. After that, **WitnessCam Pro is $9/month** via Stripe Checkout. Evidence still never leaves the browser.

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
| Timestamp | Yours Wallet / yours-agent sidecar, else local demo miner | Same |
| Block height / txid | WhatsOnChain after broadcast; demo height if offline | Bitcoin SV |
| Storage | IndexedDB on this origin | Holder-controlled bag + optional encrypted object store |

## Stack

Vite, React, TypeScript, WebCrypto, IndexedDB. No backend. No analytics. No upload of media.
