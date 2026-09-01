import { verifyChain } from "./custody";
import { explorerTxUrl } from "./yours";
import type { EvidenceBag, PublicProof } from "./types";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

export async function buildCustodyCertificate(bag: EvidenceBag | PublicProof): Promise<string> {
  const chain = await verifyChain(bag.events);
  const stamp = bag.rfc3161;
  const explorer = explorerTxUrl(bag.anchor.network, bag.anchor.txid);
  const org = "orgName" in bag ? bag.orgName : undefined;
  const bagId = "id" in bag ? bag.id : bag.bagId;
  const situation = bag.situation;
  const sceneLabel = bag.sceneLabel;

  const rows = bag.events
    .map(
      (ev, i) => `<tr>
        <td>${String(i + 1).padStart(2, "0")}</td>
        <td>${esc(ev.type)}</td>
        <td>${esc(when(ev.at))}</td>
        <td>${esc(ev.actorName)}</td>
        <td class="mono">${esc(ev.eventHash)}</td>
      </tr>`,
    )
    .join("");

  const tsaSection = stamp
    ? `<section>
        <h2>Independent timestamp (RFC 3161)</h2>
        <p>An independent Time Stamp Authority issued a token over the SHA-256 of this item. RFC 3161 is the Internet standard for trusted timestamps. It is the same class of evidence used in code signing and qualified electronic signatures. Counsel does not need to explain a cryptocurrency.</p>
        <table class="kv">
          <tr><th>Authority</th><td>${esc(stamp.tsa)}</td></tr>
          <tr><th>TSA URL</th><td>${esc(stamp.tsaUrl)}</td></tr>
          <tr><th>Time attested (genTime)</th><td>${esc(when(stamp.genTime))}</td></tr>
          <tr><th>Token serial</th><td class="mono">${esc(stamp.serial || "—")}</td></tr>
          <tr><th>Hash inside the token</th><td class="mono">${esc(stamp.hashedMessage)}</td></tr>
        </table>
        <p>The token is attached as a binary <code>.tsr</code> file and as Base64 below. Verify with OpenSSL:</p>
        <pre>openssl ts -verify -digest ${esc(bag.contentHash)} -sha256 -in ${esc(bagId)}.tsr</pre>
      </section>`
    : `<section>
        <h2>Independent timestamp</h2>
        <p class="warn">This bag was sealed before WitnessCam recorded an RFC 3161 token. Do not tender it as independently timestamped without a later TSA stamp of the same SHA-256.</p>
      </section>`;

  const chainSection =
    bag.anchor.network !== "none" && bag.anchor.network !== "bsv-demo" && bag.anchor.txid
      ? `<section>
          <h2>Optional public bulletin</h2>
          <p>A hash commitment was also broadcast as a Bitcoin SV OP_RETURN. This is not required to read the RFC 3161 token. It is a public copy of the same digest.</p>
          <p class="mono">${explorer ? `<a href="${esc(explorer)}">${esc(bag.anchor.txid)}</a>` : esc(bag.anchor.txid)}</p>
        </section>`
      : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Certificate of chain of custody — ${esc(bagId)}</title>
  <style>
    body { font: 16px/1.45 Georgia, serif; color: #111; max-width: 740px; margin: 32px auto; padding: 0 20px 80px; }
    h1 { font-size: 28px; font-weight: 400; margin-bottom: 8px; }
    h2 { font-size: 18px; margin-top: 28px; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    .kicker { letter-spacing: .16em; text-transform: uppercase; font: 11px/1 ui-monospace, monospace; color: #555; }
    .mono { font-family: ui-monospace, Menlo, monospace; font-size: 12px; word-break: break-all; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
    th, td { text-align: left; vertical-align: top; padding: 6px 8px 6px 0; border-top: 1px solid #ddd; }
    table.kv th { width: 200px; color: #555; font-weight: 500; }
    .warn { color: #8a1f11; }
    footer { margin-top: 36px; font-size: 13px; color: #555; }
    @media print { a { color: inherit; text-decoration: none; } }
  </style>
</head>
<body>
  <p class="kicker">WitnessCam · Certificate of chain of custody</p>
  <h1>${esc(bagId)}</h1>
  <p>This document is an export of records held on the capturing device. WitnessCam never received the file. Only the SHA-256 digest was submitted to a Time Stamp Authority.</p>
  <section>
    <h2>Item</h2>
    <table class="kv">
      <tr><th>Kind</th><td>${esc(bag.kind)}</td></tr>
      ${situation ? `<tr><th>Situation</th><td>${esc(situation)}</td></tr>` : ""}
      ${sceneLabel ? `<tr><th>Scene label</th><td>${esc(sceneLabel)}</td></tr>` : ""}
      <tr><th>Captured</th><td>${esc(when(bag.capturedAt))}</td></tr>
      <tr><th>Original holder</th><td>${esc(bag.holderName)}</td></tr>
      ${org ? `<tr><th>Organization</th><td>${esc(org)}</td></tr>` : ""}
      <tr><th>Device</th><td>${esc(bag.deviceId)}</td></tr>
      <tr><th>Content SHA-256</th><td class="mono">${esc(bag.contentHash)}</td></tr>
      <tr><th>Custody chain tip</th><td class="mono">${esc(bag.chainTip)}</td></tr>
      <tr><th>Hash chain</th><td>${chain.ok ? "Intact — each event commits to the previous hash." : `Broken — ${esc("reason" in chain ? chain.reason : "")}`}</td></tr>
    </table>
  </section>
  ${tsaSection}
  ${chainSection}
  <section>
    <h2>Custody log</h2>
    <p>Each row is hashed. Altering a name, time, or prior hash breaks verification from that point forward.</p>
    <table>
      <thead><tr><th>#</th><th>Event</th><th>Time (UTC)</th><th>Actor</th><th>Event hash</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>
  <section>
    <h2>How to verify without WitnessCam</h2>
    <ol>
      <li>SHA-256 the original file. It must equal the content digest above.</li>
      <li>Verify the RFC 3161 token against that digest with OpenSSL or any TSA-aware tool.</li>
      <li>Recompute each event hash from the public proof JSON. The chain tip must match.</li>
    </ol>
  </section>
  ${stamp ? `<section><h2>RFC 3161 token (Base64)</h2><p class="mono">${esc(stamp.tokenB64)}</p></section>` : ""}
  <footer>
    Generated ${esc(when(new Date().toISOString()))}. This certificate is not itself a court filing.
    It is a human-readable rendering of the same hashes and timestamp token a technician can verify independently.
  </footer>
</body>
</html>`;
}

export async function downloadCustodyExport(bag: EvidenceBag | PublicProof): Promise<void> {
  const id = "id" in bag ? bag.id : bag.bagId;
  const html = await buildCustodyCertificate(bag);
  const htmlBlob = new Blob([html], { type: "text/html;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(htmlBlob);
  a.download = `${id}.custody.html`;
  a.click();
  if (bag.rfc3161?.tokenB64) {
    const bin = Uint8Array.from(atob(bag.rfc3161.tokenB64), (c) => c.charCodeAt(0));
    const tsr = document.createElement("a");
    tsr.href = URL.createObjectURL(new Blob([bin], { type: "application/timestamp-reply" }));
    tsr.download = `${id}.tsr`;
    tsr.click();
  }
}

export async function printCustodyCertificate(bag: EvidenceBag | PublicProof): Promise<void> {
  const html = await buildCustodyCertificate(bag);
  const w = window.open("", "_blank");
  if (!w) {
    await downloadCustodyExport(bag);
    return;
  }
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
