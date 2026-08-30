import { useEffect, useState } from "react";
import { getDevice, holderFromDevice, setHolderName } from "../lib/device";
import { createOrg, joinOrg, leaveOrg, type OrgPublic } from "../lib/org";
import { useBilling } from "../lib/billing";

export function OrgDesk() {
  const device = getDevice();
  const holder = holderFromDevice(device);
  const { entitlement, startCheckout, openPortal, busy, notice, setNotice, refresh } = useBilling();
  const [org, setOrg] = useState<OrgPublic | null>(entitlement.org);
  const [name, setName] = useState(org?.name || `${holder.holderName}'s desk`);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    setOrg(entitlement.org);
  }, [entitlement.org]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      setHolderName(holder.holderName);
      const next = await createOrg({
        name,
        deviceId: device.id,
        displayName: holder.holderName,
        deviceLabel: device.label,
      });
      setOrg(next);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setWorking(false);
    }
  }

  async function onJoin(e: React.FormEvent) {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const next = await joinOrg({
        code,
        deviceId: device.id,
        displayName: holder.holderName,
        deviceLabel: device.label,
      });
      setOrg(next);
      setCode("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Join failed");
    } finally {
      setWorking(false);
    }
  }

  async function onLeave() {
    setWorking(true);
    try {
      await leaveOrg(device.id);
      setOrg(null);
      await refresh();
    } finally {
      setWorking(false);
    }
  }

  return (
    <section className="org">
      <p className="kicker">Organization</p>
      <h2>One desk. Every field phone.</h2>
      <p className="lede">
        Pro is billed to the organization, not the cookie on this browser. Create a desk, read the
        join code to a phone in the field, and every device on the roster shares the same license.
        Evidence still never leaves the device that captured it.
      </p>

      {org ? (
        <>
          <dl className="meta-list">
            <div>
              <dt>Desk</dt>
              <dd>{org.name}</dd>
            </div>
            <div>
              <dt>Join code</dt>
              <dd className="join-code">{org.joinCode}</dd>
            </div>
            <div>
              <dt>Your role</dt>
              <dd>{org.role}</dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>{entitlement.pro ? "Pro covers this organization" : "Free tier — 3 seals per device until Pro"}</dd>
            </div>
          </dl>
          <p className="caption">
            On a field phone: open WitnessCam → Org → Join, and type that code. Add to Home Screen
            so capture works without a browser chrome.
          </p>
          <h3 className="org-sub">Roster</h3>
          <table className="ledger">
            <thead>
              <tr>
                <th>Holder</th>
                <th>Device</th>
                <th>Role</th>
              </tr>
            </thead>
            <tbody>
              {org.members.map((m) => (
                <tr key={`${m.displayName}-${m.joinedAt}`}>
                  <td>{m.displayName}</td>
                  <td>{m.deviceLabel}</td>
                  <td>{m.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="actions">
            {!entitlement.pro && (
              <button className="btn btn-amber" disabled={busy} onClick={() => void startCheckout()}>
                {busy ? "Redirecting…" : "Buy Pro for this org · $9/mo"}
              </button>
            )}
            {entitlement.pro && (
              <button className="btn" disabled={busy} onClick={() => void openPortal()}>
                Billing portal
              </button>
            )}
            <button className="btn btn-ghost" disabled={working} onClick={() => void onLeave()}>
              Leave this org
            </button>
          </div>
        </>
      ) : (
        <div className="org-forms">
          <form onSubmit={(e) => void onCreate(e)}>
            <p className="kicker">Create</p>
            <label className="field">
              <span>Desk name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
            </label>
            <button className="btn btn-amber" disabled={working}>
              {working ? "Working…" : "Create organization"}
            </button>
          </form>
          <form onSubmit={(e) => void onJoin(e)}>
            <p className="kicker">Join a field desk</p>
            <label className="field">
              <span>Join code</span>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABCD2345"
                autoCapitalize="characters"
                required
              />
            </label>
            <button className="btn" disabled={working}>
              Join
            </button>
          </form>
        </div>
      )}
      {(error || notice) && <p className="error">{error || notice}</p>}
      {notice && (
        <button className="btn btn-ghost" onClick={() => setNotice(null)}>
          Dismiss
        </button>
      )}
    </section>
  );
}
