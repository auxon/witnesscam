import { useBilling } from "../lib/billing";

export function Paywall() {
  const { paywall, setPaywall, startCheckout, busy, notice, remaining, entitlement } =
    useBilling();
  if (!paywall) return null;

  return (
    <div className="paywall-scrim" role="dialog" aria-labelledby="paywall-title">
      <div className="paywall">
        <p className="kicker">WitnessCam Pro</p>
        <h2 id="paywall-title">Three bags on the house.</h2>
        <p className="lede">
          After that, Pro covers the whole organization. Unlimited seals, RFC 3161
          timestamps counsel can explain, and a printable custody certificate.
          Stripe handles the money. We never see the pixels.
        </p>
        <p className="price">
          $9<span>/month</span>
        </p>
        <ul className="paywall-list">
          <li>Unlimited sealed stills and 15s clips for every org device</li>
          <li>RFC 3161 timestamp (DigiCert / Sectigo) — not a coin</li>
          <li>Printable chain-of-custody certificate for counsel</li>
          <li>Cancel in the Stripe customer portal</li>
        </ul>
        {notice && <p className="error">{notice}</p>}
        {!entitlement.configured && (
          <p className="error">Stripe is not configured on this Worker yet.</p>
        )}
        <div className="actions">
          <button
            className="btn btn-amber"
            disabled={busy || !entitlement.configured}
            onClick={() => void startCheckout()}
          >
            {busy ? "Redirecting…" : "Continue to Stripe"}
          </button>
          <button className="btn btn-ghost" onClick={() => setPaywall(false)}>
            {remaining > 0 ? "Not now" : "Keep looking, stop sealing"}
          </button>
        </div>
      </div>
    </div>
  );
}
