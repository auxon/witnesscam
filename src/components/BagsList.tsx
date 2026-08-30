import { useEffect, useState } from "react";
import { formatBytes, shortHash } from "../lib/bytes";
import { navigate } from "../lib/router";
import { listBags } from "../lib/storage";
import type { EvidenceBag } from "../lib/types";

export function BagsList() {
  const [bags, setBags] = useState<EvidenceBag[] | null>(null);

  useEffect(() => {
    void listBags().then(setBags);
  }, []);

  if (!bags) return <p className="hint">Opening the locker…</p>;
  if (bags.length === 0) {
    return (
      <section>
        <p className="kicker">Locker</p>
        <h2>No sealed bags on this device.</h2>
        <p className="lede">Capture or upload a still, then seal it. Ciphertext stays in IndexedDB.</p>
        <button className="btn btn-amber" onClick={() => navigate({ name: "studio" })}>
          Open studio
        </button>
      </section>
    );
  }

  return (
    <section>
      <p className="kicker">Locker · {bags.length}</p>
      <h2>Sealed on this device</h2>
      <ul className="bag-list">
        {bags.map((bag) => (
          <li key={bag.id}>
            <button className="bag-row" onClick={() => navigate({ name: "bag", id: bag.id })}>
              <span className="mono">{bag.id}</span>
              <span>
                {bag.kind} · {formatBytes(bag.byteLength)} · {bag.holderName}
              </span>
              <span className="mono muted">{shortHash(bag.contentHash, 10)}…</span>
              <span className="muted">{new Date(bag.capturedAt).toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
