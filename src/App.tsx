import { useEffect, useState } from "react";
import { About } from "./components/About";
import { BagsList } from "./components/BagsList";
import { CaptureStudio } from "./components/CaptureStudio";
import { EvidenceBagView } from "./components/EvidenceBag";
import { Ledger } from "./components/Ledger";
import { VerifyDesk } from "./components/VerifyDesk";
import { BillingChip } from "./components/BillingChip";
import { WalletChip } from "./components/WalletChip";
import { Paywall } from "./components/Paywall";
import { BillingProvider, useBilling } from "./lib/billing";
import { WalletProvider } from "./lib/wallet";
import { YoursWalletProvider } from "./components/YoursWalletProvider";
import { navigate, parseHash } from "./lib/router";
import type { Route } from "./lib/types";

export default function App() {
  return (
    <YoursWalletProvider>
      <WalletProvider>
        <BillingProvider>
          <AppShell />
        </BillingProvider>
      </WalletProvider>
    </YoursWalletProvider>
  );
}

function AppShell() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  const { notice, setNotice } = useBilling();

  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    if (!window.location.hash) window.location.hash = "/";
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <div className="shell">
      <div className="tape" aria-hidden="true">
        <span>SEALED · CHAIN OF CUSTODY · WITNESSCAM · HASH THEN TIMESTAMP · </span>
        <span>SEALED · CHAIN OF CUSTODY · WITNESSCAM · HASH THEN TIMESTAMP · </span>
      </div>
      <header className="top">
        <button className="brand" onClick={() => navigate({ name: "studio" })}>
          <span className="brand-mark">WC</span>
          WitnessCam
        </button>
        <nav>
          {(
            [
              ["studio", "Studio"],
              ["bags", "Locker"],
              ["verify", "Verify"],
              ["ledger", "Ledger"],
              ["about", "Lineage"],
            ] as const
          ).map(([name, label]) => (
            <button
              key={name}
              className={route.name === name || (name === "bags" && route.name === "bag") ? "is-on" : ""}
              onClick={() =>
                navigate(
                  name === "verify"
                    ? { name: "verify" }
                    : name === "studio"
                      ? { name: "studio" }
                      : name === "bags"
                        ? { name: "bags" }
                        : name === "ledger"
                          ? { name: "ledger" }
                          : { name: "about" },
                )
              }
            >
              {label}
            </button>
          ))}
        </nav>
        <div className="chips">
          <WalletChip />
          <BillingChip />
        </div>
      </header>
      {notice && (
        <p className="banner">
          {notice}{" "}
          <button className="banner-x" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      )}
      <main>
        {route.name === "studio" && <CaptureStudio />}
        {route.name === "bags" && <BagsList />}
        {route.name === "bag" && <EvidenceBagView id={route.id} />}
        {route.name === "verify" && <VerifyDesk presetHash={route.hash} />}
        {route.name === "ledger" && <Ledger />}
        {route.name === "about" && <About />}
      </main>
      <Paywall />
    </div>
  );
}
