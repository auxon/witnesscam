import { useEffect, useState } from "react";
import { shortHash } from "../lib/bytes";
import { navigate } from "../lib/router";
import { listLedger } from "../lib/storage";
import type { LedgerEntry } from "../lib/types";

export function Ledger() {
  const [rows, setRows] = useState<LedgerEntry[] | null>(null);

  useEffect(() => {
    void listLedger().then(setRows);
  }, []);

  return (
    <section>
      <p className="kicker">Public ledger</p>
      <h2>Hashes only. Never the recording.</h2>
      <p className="lede">
        This is the view a stranger gets: bag id, content digest, chain tip, demo block. No
        thumbnails. No keys.
      </p>
      {!rows || rows.length === 0 ? (
        <p className="hint">Ledger empty. Seal something in the studio.</p>
      ) : (
        <table className="ledger">
          <thead>
            <tr>
              <th>Bag</th>
              <th>SHA-256</th>
              <th>Tip</th>
              <th>Block</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.bagId} onClick={() => navigate({ name: "verify", hash: row.contentHash })}>
                <td className="mono">{row.bagId}</td>
                <td className="mono">{shortHash(row.contentHash, 16)}…</td>
                <td className="mono">{shortHash(row.chainTip, 12)}…</td>
                <td>#{row.anchor.blockHeight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
