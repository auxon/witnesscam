import { useEffect, useState } from "react";
import { shortHash } from "../lib/bytes";
import { navigate } from "../lib/router";
import { listLedger } from "../lib/storage";
import type { LedgerEntry } from "../lib/types";
import { explorerTxUrl } from "../lib/yours";

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
        This is the view a stranger gets: bag id, content digest, chain tip, BSV tx. No
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
              <th>Anchor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.bagId} onClick={() => navigate({ name: "verify", hash: row.contentHash })}>
                <td className="mono">{row.bagId}</td>
                <td className="mono">{shortHash(row.contentHash, 16)}…</td>
                <td className="mono">{shortHash(row.chainTip, 12)}…</td>
                <td>
                  {row.anchor.network === "bsv-demo"
                    ? `#${row.anchor.blockHeight}`
                    : (
                      <a
                        href={explorerTxUrl(row.anchor.network, row.anchor.txid) ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {shortHash(row.anchor.txid, 10)}…
                      </a>
                    )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
