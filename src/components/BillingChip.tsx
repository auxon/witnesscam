import { useBilling } from "../lib/billing";

export function BillingChip() {
  const { entitlement, remaining, setPaywall, openPortal, busy } = useBilling();

  if (entitlement.pro) {
    return (
      <button className="chip chip-pro" disabled={busy} onClick={() => void openPortal()}>
        {entitlement.org ? `${entitlement.org.name} · PRO` : "PRO"}
      </button>
    );
  }

  return (
    <button className="chip" onClick={() => setPaywall(true)}>
      {entitlement.org ? `${entitlement.org.name} · ` : ""}
      {remaining} free left · $9/mo
    </button>
  );
}
