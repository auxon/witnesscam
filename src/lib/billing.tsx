import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { getDevice } from "../lib/device";
import { listBags } from "../lib/storage";
import { readBillingFlag } from "./billingFlag";

export const FREE_SEAL_LIMIT = 3;

export type Entitlement = {
  pro: boolean;
  status: string;
  configured: boolean;
  freeLimit: number;
  email: string | null;
};

type BillingValue = {
  entitlement: Entitlement;
  bagCount: number;
  remaining: number;
  canSeal: boolean;
  paywall: boolean;
  setPaywall: (open: boolean) => void;
  busy: boolean;
  notice: string | null;
  setNotice: (msg: string | null) => void;
  refresh: () => Promise<void>;
  startCheckout: () => Promise<void>;
  openPortal: () => Promise<void>;
  requireProForSeal: () => boolean;
};

const BillingContext = createContext<BillingValue | null>(null);

function apiUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/?$/, "/")}api/${path}`;
}

export function BillingProvider({ children }: { children: ReactNode }) {
  const [entitlement, setEntitlement] = useState<Entitlement>({
    pro: false,
    status: "free",
    configured: true,
    freeLimit: FREE_SEAL_LIMIT,
    email: null,
  });
  const [bagCount, setBagCount] = useState(0);
  const [paywall, setPaywall] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const deviceId = getDevice().id;
    const [bags, res] = await Promise.all([
      listBags(),
      fetch(`${apiUrl("entitlement")}?deviceId=${encodeURIComponent(deviceId)}`).catch(
        () => null,
      ),
    ]);
    setBagCount(bags.length);
    if (res?.ok) {
      const data = (await res.json()) as Partial<Entitlement> & { error?: string };
      setEntitlement({
        pro: Boolean(data.pro),
        status: data.status || "free",
        configured: data.configured !== false,
        freeLimit: data.freeLimit ?? FREE_SEAL_LIMIT,
        email: data.email || null,
      });
    } else {
      setEntitlement((prev) => ({ ...prev, configured: false }));
    }
  }

  useEffect(() => {
    void refresh();
    const billing = readBillingFlag(window.location.search, window.location.hash);
    if (billing === "pro") setNotice("Pro is active. Seal without a bag limit.");
    if (billing === "failed") setNotice("Checkout did not complete.");
    if (billing) {
      const url = new URL(window.location.href);
      url.search = "";
      if (url.hash.includes("?")) url.hash = url.hash.slice(0, url.hash.indexOf("?"));
      window.history.replaceState({}, "", url);
    }
  }, []);

  const remaining = Math.max(0, entitlement.freeLimit - bagCount);
  const canSeal = entitlement.pro || bagCount < entitlement.freeLimit;

  async function startCheckout() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(apiUrl("checkout"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceId: getDevice().id }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error || "Checkout unavailable");
      }
      window.location.assign(data.url);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Checkout failed");
      setBusy(false);
    }
  }

  async function openPortal() {
    setBusy(true);
    try {
      const res = await fetch(apiUrl("portal"), { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Portal unavailable");
      window.location.assign(data.url);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Portal failed");
      setBusy(false);
    }
  }

  function requireProForSeal() {
    if (canSeal) return true;
    setPaywall(true);
    return false;
  }

  const value: BillingValue = {
    entitlement,
    bagCount,
    remaining,
    canSeal,
    paywall,
    setPaywall,
    busy,
    notice,
    setNotice,
    refresh,
    startCheckout,
    openPortal,
    requireProForSeal,
  };

  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>;
}

export function useBilling(): BillingValue {
  const ctx = useContext(BillingContext);
  if (!ctx) throw new Error("useBilling outside provider");
  return ctx;
}
