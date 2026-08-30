import type { CustodyEvent } from "../lib/types";

const STEPS = [
  { key: "CAPTURED", label: "Device" },
  { key: "ENCRYPTED", label: "Encrypt" },
  { key: "HASHED", label: "Hash" },
  { key: "TIMESTAMPED", label: "Timestamp" },
  { key: "TRANSFERRED", label: "Custody" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

const LIVE_ORDER: StepKey[] = [
  "CAPTURED",
  "ENCRYPTED",
  "HASHED",
  "TIMESTAMPED",
];

export function CustodyStrip({
  events,
  liveStep,
  compact = false,
}: {
  events?: CustodyEvent[];
  liveStep?: "captured" | "encrypted" | "hashed" | "timestamped" | "sealed";
  compact?: boolean;
}) {
  const present = new Set(events?.map((e) => e.type) ?? []);
  const liveIndex =
    liveStep === "captured"
      ? 0
      : liveStep === "encrypted"
        ? 1
        : liveStep === "hashed"
          ? 2
          : liveStep === "timestamped" || liveStep === "sealed"
            ? 3
            : -1;

  const nodes = STEPS.filter((s) => s.key !== "TRANSFERRED" || present.has("TRANSFERRED"));

  return (
    <ol className={`strip ${compact ? "strip-compact" : ""}`} aria-label="Chain of custody">
      {nodes.map((step, i) => {
        const done =
          present.has(step.key) ||
          (liveIndex >= 0 &&
            LIVE_ORDER.indexOf(step.key as (typeof LIVE_ORDER)[number]) >= 0 &&
            LIVE_ORDER.indexOf(step.key as (typeof LIVE_ORDER)[number]) <= liveIndex) ||
          (liveStep === "sealed" && step.key !== "TRANSFERRED");
        const active =
          (liveIndex >= 0 &&
            LIVE_ORDER[liveIndex] === step.key &&
            liveStep !== "sealed") ||
          (liveStep === "sealed" && step.key === "TIMESTAMPED");
        return (
          <li
            key={step.key}
            className={`strip-node ${done ? "is-done" : ""} ${active ? "is-active" : ""}`}
          >
            <span className="strip-index">{String(i + 1).padStart(2, "0")}</span>
            <span className="strip-label">{step.label}</span>
            <span className="strip-key">{step.key}</span>
          </li>
        );
      })}
    </ol>
  );
}
