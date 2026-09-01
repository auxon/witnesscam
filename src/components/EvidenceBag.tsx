import { useEffect, useState } from "react";
import { formatBytes, shortHash } from "../lib/bytes";
import { decryptBytes, importKeyB64 } from "../lib/crypto";
import { verifyChain } from "../lib/custody";
import { navigate } from "../lib/router";
import { getBag, getCiphertext, getKey, toProof } from "../lib/storage";
import { transferCustody } from "../lib/transfer";
import type { EvidenceBag } from "../lib/types";
import { downloadCustodyExport, printCustodyCertificate } from "../lib/auditExport";
import { situationLine } from "../lib/situation";
import { explorerTxUrl } from "../lib/yours";
import { CustodyStrip } from "./CustodyStrip";

export function EvidenceBagView({ id }: { id: string }) {
  const [bag, setBag] = useState<EvidenceBag | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [chain, setChain] = useState<string>("checking");
  const [toName, setToName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let url: string | null = null;
    (async () => {
      const found = await getBag(id);
      if (!found) {
        setBag(null);
        return;
      }
      setBag(found);
      const verified = await verifyChain(found.events);
      setChain(verified.ok ? "intact" : `broken: ${verified.reason}`);
      const [blob, key] = await Promise.all([getCiphertext(id), getKey(id)]);
      if (blob && key) {
        try {
          const cryptoKey = await importKeyB64(key.keyB64);
          const plain = await decryptBytes(blob, found.ivHex, cryptoKey);
          const file = new Blob([new Uint8Array(plain)], { type: found.mimeType });
          url = URL.createObjectURL(file);
          setPreview(url);
        } catch {
          setPreview(null);
        }
      }
    })();
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  async function onTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!bag) return;
    setBusy(true);
    setError(null);
    try {
      const next = await transferCustody(bag, toName, note);
      setBag(next);
      setToName("");
      setNote("");
      const verified = await verifyChain(next.events);
      setChain(verified.ok ? "intact" : `broken: ${verified.reason}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  }

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(null), 1600);
  }

  if (!bag) {
    return (
      <p className="hint">
        No bag <code>{id}</code> on this device. Import a public proof on Verify.
      </p>
    );
  }

  const proof = JSON.stringify(toProof(bag), null, 2);
  const verifyUrl = `${window.location.origin}${window.location.pathname}#/verify/${bag.contentHash}`;
  const live = bag.anchor.network !== "bsv-demo" && bag.anchor.network !== "none";
  const explorer = explorerTxUrl(bag.anchor.network, bag.anchor.txid);
  const tsa = bag.rfc3161;
  const scene = situationLine(bag);

  return (
    <article className="bag">
      <header className="bag-head">
        <div>
          <p className="kicker">Evidence bag</p>
          <h2>{bag.id}</h2>
          <p className="mono muted">
            {bag.filename} · {formatBytes(bag.byteLength)} · holder {bag.holderName}
          </p>
          {scene && (
            <p className="situation-tag" data-testid="bag-situation">
              {scene}
            </p>
          )}
        </div>
        <div className={`seal ${chain === "intact" ? "seal-ok" : "seal-bad"}`}>
          {chain === "intact" ? "TAMPER SEAL INTACT" : chain}
        </div>
      </header>

      <div className="bag-grid">
        <div className="preview-card">
          {preview ? (
            bag.kind === "video" ? (
              <video src={preview} controls playsInline />
            ) : (
              <img src={preview} alt="Decrypted evidence" />
            )
          ) : (
            <p className="hint">Holder key missing — ciphertext stays closed.</p>
          )}
          <p className="caption">
            Decrypted only in this browser. The public proof does not include pixels or the key.
          </p>
        </div>
        <div>
          <CustodyStrip events={bag.events} />
          <dl className="meta-list">
            {bag.situation && (
              <div>
                <dt>Situation</dt>
                <dd data-testid="bag-situation-meta">{bag.situation}</dd>
              </div>
            )}
            {bag.sceneLabel && (
              <div>
                <dt>Scene label</dt>
                <dd>{bag.sceneLabel}</dd>
              </div>
            )}
            <div>
              <dt>Content SHA-256</dt>
              <dd className="mono wrap">{bag.contentHash}</dd>
            </div>
            <div>
              <dt>Chain tip</dt>
              <dd className="mono wrap">{bag.chainTip}</dd>
            </div>
            <div>
              <dt>RFC 3161 timestamp</dt>
              <dd>
                {tsa
                  ? `${tsa.tsa} attested ${new Date(tsa.genTime).toUTCString()}`
                  : "Not recorded on this bag"}
              </dd>
            </div>
            <div>
              <dt>OP_RETURN</dt>
              <dd className="mono wrap">{bag.anchor.opReturnHex}</dd>
            </div>
            <div>
              <dt>{live ? "BSV tx" : "Demo tx"}</dt>
              <dd className="mono wrap">
                {explorer ? (
                  <a href={explorer} target="_blank" rel="noreferrer">
                    {bag.anchor.txid}
                  </a>
                ) : (
                  <>
                    #{bag.anchor.blockHeight} · {shortHash(bag.anchor.txid, 16)}…
                  </>
                )}
              </dd>
            </div>
            <div>
              <dt>Device</dt>
              <dd>
                {bag.deviceId} · {bag.deviceLabel}
              </dd>
            </div>
          </dl>
          <p className="caption">
            {tsa
              ? `The clock of record is RFC 3161 (${tsa.tsa}). The file never left this device — only the SHA-256 went to the TSA.`
              : "No RFC 3161 token on this bag. Re-seal a copy if counsel needs an independent timestamp."}
            {live ? " A public BSV bulletin was added as well." : ""}
          </p>
        </div>
      </div>

      <ol className="log">
        {bag.events.map((ev, i) => (
          <li key={ev.eventHash}>
            <span className="log-i">{String(i + 1).padStart(2, "0")}</span>
            <div>
              <strong>{ev.type}</strong>
              <span className="muted">
                {" "}
                {new Date(ev.at).toLocaleString()} · {ev.actorName}
              </span>
              <p className="mono wrap">{ev.eventHash}</p>
              {Object.keys(ev.meta).length > 0 && (
                <p className="muted">
                  {Object.entries(ev.meta)
                    .map(([k, v]) => `${k}: ${v}`)
                    .join(" · ")}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      <form className="transfer" onSubmit={(e) => void onTransfer(e)}>
        <p className="kicker">Transfer custody</p>
        <div className="row">
          <label className="field">
            <span>To</span>
            <input
              value={toName}
              onChange={(e) => setToName(e.target.value)}
              placeholder="Newsroom desk, insurer, counsel…"
              required
            />
          </label>
          <label className="field">
            <span>Note</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Handed over at 14:02"
            />
          </label>
          <button className="btn btn-amber" disabled={busy}>
            {busy ? "Writing…" : "Handoff"}
          </button>
        </div>
        {error && <p className="error">{error}</p>}
      </form>

      <div className="actions">
        <button
          className="btn btn-amber"
          onClick={() => void printCustodyCertificate(bag)}
        >
          Print audit for counsel
        </button>
        <button className="btn" onClick={() => void downloadCustodyExport(bag)}>
          Download certificate + .tsr
        </button>
        <button className="btn" onClick={() => void copy("link", verifyUrl)}>
          {copied === "link" ? "Copied" : "Copy verify link"}
        </button>
        <button className="btn" onClick={() => void copy("proof", proof)}>
          {copied === "proof" ? "Copied" : "Copy public proof"}
        </button>
        <button
          className="btn btn-ghost"
          onClick={() => {
            const blob = new Blob([proof], { type: "application/json" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${bag.id}.proof.json`;
            a.click();
          }}
        >
          Download proof
        </button>
        <button className="btn btn-ghost" onClick={() => navigate({ name: "verify", hash: bag.contentHash })}>
          Open verify desk
        </button>
      </div>
    </article>
  );
}
