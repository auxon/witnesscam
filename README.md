# WitnessCam

Record. Encrypt on-device. Hash. Timestamp. Hand the bag like a lab sample.

This is the first slice of the WitnessCam idea: a browser instrument that seals a still or a 15-second clip the way a DNA lab seals a sample. Plaintext never leaves the device. The public artifact is a SHA-256 digest, a custody hash chain, and a Bitcoin-style OP_RETURN script.

## Loop

1. **Capture** — camera still, 15s video, file upload, or a generated sample still (for machines without a camera).
2. **Encrypt** — AES-256-GCM in WebCrypto. The key stays in IndexedDB on this origin.
3. **Hash** — SHA-256 of the original bytes. That digest is the identity of the evidence.
4. **Timestamp** — a local demo miner writes `OP_RETURN WC1 || contentHash || custodyTip`. Same payload production would broadcast to BSV.
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

## What is demo vs real

| Piece | This build | Production |
| --- | --- | --- |
| Capture / encrypt / hash / custody chain | Real, in-browser | Same |
| OP_RETURN script | Real encoding | Broadcast to BSV |
| Block height / txid | Local demo miner | Bitcoin SV node |
| Storage | IndexedDB on this origin | Holder-controlled bag + optional encrypted object store |

## Stack

Vite, React, TypeScript, WebCrypto, IndexedDB. No backend. No analytics. No upload of media.
