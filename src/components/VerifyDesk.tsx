import { useEffect, useState } from "react";
import { sha256Hex, shortHash } from "../lib/bytes";
import { decodeOpReturn } from "../lib/chain";
import { verifyChain } from "../lib/custody";
import { getBagByHash, listLedger } from "../lib/storage";
import type { EvidenceBag, LedgerEntry, PublicProof } from "../lib/types";
import { CustodyStrip } from "./CustodyStrip";

type Verdict =
  | { kind: "idle" }
  | { kind: "match"; source: string }
  | { kind: "mismatch"; expected: string; actual: string }
  | { kind: "unknown" }
  | { kind: "broken"; reason: string };

export function VerifyDesk({ presetHash }: { presetHash?: string }) {
  const [hashInput, setHashInput] = useState(presetHash ?? "");
  const [proofText, setProofText] = useState("");
  const [fileHash, setFileHash] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [bag, setBag] = useState<EvidenceBag | PublicProof | null>(null);
  const [verdict, setVerdict] = useState<Verdict>({ kind: "idle" });
  const [ledgerHit, setLedgerHit] = useState<LedgerEntry | null>(null);

  useEffect(() => {
    if (presetHash) {
      setHashInput(presetHash);
      void lookup(presetHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetHash]);

  async function lookup(hex: string) {
    const clean = hex.trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(clean)) {
      setBag(null);
      setLedgerHit(null);
      return;
    }
    const found = await getBagByHash(clean);
    const ledger = await listLedger();
    const hit = ledger.find((r) => r.contentHash === clean) ?? null;
    setLedgerHit(hit);
    if (found) {
      setBag(found);
      const chain = await verifyChain(found.events);
      setVerdict(chain.ok ? { kind: "match", source: "local bag" } : { kind: "broken", reason: chain.reason });
    } else if (hit) {
      setBag(null);
      setVerdict({ kind: "match", source: "public ledger (hash only)" });
    } else {
      setBag(null);
      setVerdict({ kind: "unknown" });
    }
  }

  async function onFile(file: File) {
    if (file.name.endsWith(".json")) {
      const text = await file.text();
      setProofText(text);
      applyProof(text);
      return;
    }
    const digest = await sha256Hex(await file.arrayBuffer());
    setFileHash(digest);
    setFileName(file.name);
    const expected = (bag?.contentHash || hashInput.trim().toLowerCase()) ?? "";
    if (expected && /^[0-9a-f]{64}$/.test(expected)) {
      if (digest === expected) setVerdict({ kind: "match", source: file.name });
      else setVerdict({ kind: "mismatch", expected, actual: digest });
    } else {
      setHashInput(digest);
      await lookup(digest);
    }
  }

  async function applyProof(text: string) {
    try {
      const proof = JSON.parse(text) as PublicProof;
      if (!proof.events || !proof.contentHash) throw new Error("not a WitnessCam proof");
      const chain = await verifyChain(proof.events);
      const decoded = decodeOpReturn(proof.anchor.opReturnHex);
      if (decoded.contentHash !== proof.contentHash) {
        setVerdict({ kind: "broken", reason: "OP_RETURN content hash mismatch" });
        setBag(proof);
        return;
      }
      const committedTip = decoded.chainTip;
      const tipKnown = proof.events.some((e) => e.eventHash === committedTip);
      if (!tipKnown) {
        setVerdict({ kind: "broken", reason: "OP_RETURN tip is not in the custody log" });
        setBag(proof);
        return;
      }
      setBag(proof);
      setHashInput(proof.contentHash);
      if (!chain.ok) {
        setVerdict({ kind: "broken", reason: chain.reason });
        return;
      }
      if (fileHash && fileHash !== proof.contentHash) {
        setVerdict({ kind: "mismatch", expected: proof.contentHash, actual: fileHash });
        return;
      }
      setVerdict({ kind: "match", source: "imported proof" });
    } catch (err) {
      setVerdict({
        kind: "broken",
        reason: err instanceof Error ? err.message : "invalid proof",
      });
    }
  }

  const tone =
    verdict.kind === "match"
      ? "ok"
      : verdict.kind === "mismatch" || verdict.kind === "broken"
        ? "bad"
        : verdict.kind === "unknown"
          ? "warn"
          : "";

  return (
    <section className="verify">
      <p className="kicker">Verify desk</p>
      <h2>Produce the file. We never needed the pixels.</h2>
      <p className="lede">
        Drop the original recording to recompute SHA-256. Drop a public proof to check the custody
        chain and OP_RETURN commitment. The server — if you even have one — never sees plaintext.
      </p>

      <div className={`verdict ${tone}`}>
        {verdict.kind === "idle" && "Waiting for a hash, proof, or file."}
        {verdict.kind === "match" && `MATCH · ${verdict.source}`}
        {verdict.kind === "unknown" && "NO RECORD of this digest on this device."}
        {verdict.kind === "mismatch" && "HASH MISMATCH — this is not the sealed file."}
        {verdict.kind === "broken" && `CHAIN BROKEN · ${verdict.reason}`}
      </div>

      <label className="drop" htmlFor="verify-file">
        <input
          id="verify-file"
          type="file"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
            e.target.value = "";
          }}
        />
        <strong>Drop original media or a .proof.json</strong>
        <span>or click to browse</span>
        {fileName && (
          <span className="mono">
            {fileName} · {fileHash && `${shortHash(fileHash, 12)}…`}
          </span>
        )}
      </label>

      <label className="field">
        <span>Content SHA-256</span>
        <input
          className="mono"
          value={hashInput}
          onChange={(e) => setHashInput(e.target.value)}
          onBlur={() => void lookup(hashInput)}
          placeholder="64 hex chars"
        />
      </label>

      <label className="field">
        <span>Public proof JSON</span>
        <textarea
          className="mono"
          rows={8}
          value={proofText}
          onChange={(e) => setProofText(e.target.value)}
          placeholder='{"bagId":"WC-…","contentHash":"…"}'
        />
      </label>
      <button className="btn" onClick={() => applyProof(proofText)} disabled={!proofText.trim()}>
        Check proof
      </button>

      {bag && "events" in bag && (
        <div className="proof-view">
          <CustodyStrip events={bag.events} />
          <p className="mono wrap">{bag.contentHash}</p>
          {"anchor" in bag && (
            <p className="muted">
              OP_RETURN {bag.anchor.opReturnHex.slice(0, 24)}… · block #{bag.anchor.blockHeight}
            </p>
          )}
        </div>
      )}
      {!bag && ledgerHit && (
        <p className="muted">
          Ledger hit {ledgerHit.bagId} at demo height #{ledgerHit.anchor.blockHeight}. Import the
          proof to replay the full custody log.
        </p>
      )}
    </section>
  );
}
