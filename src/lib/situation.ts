export type SituationPresetId =
  | "landlord"
  | "delivery"
  | "roadside"
  | "workplace"
  | "night-walk"
  | "other";

export type SituationPreset = {
  id: SituationPresetId;
  label: string;
  sceneHint: string;
};

export type SituationContext = {
  presetId: SituationPresetId;
  situation: string;
  sceneLabel: string;
  note?: string;
};

export const SITUATION_PRESETS: SituationPreset[] = [
  { id: "landlord", label: "Landlord", sceneHint: "Apt hallway" },
  { id: "delivery", label: "Delivery", sceneHint: "Porch delivery" },
  { id: "roadside", label: "Roadside", sceneHint: "Roadside stop" },
  { id: "workplace", label: "Workplace", sceneHint: "Workplace" },
  { id: "night-walk", label: "Night walk", sceneHint: "Night walk" },
  { id: "other", label: "Other", sceneHint: "" },
];

export const DEFAULT_PANIC_PRESET: SituationPresetId = "night-walk";

const LAST_KEY = "witnesscam.situation.last";
const COACH_KEY = "witnesscam.coach.situation";

export type StoredSituation = {
  presetId: SituationPresetId;
  customLabel: string;
  sceneLabel: string;
};

function memory(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function presetById(id: SituationPresetId): SituationPreset {
  return SITUATION_PRESETS.find((p) => p.id === id) ?? SITUATION_PRESETS[0];
}

export function isPresetId(value: string | null | undefined): value is SituationPresetId {
  return SITUATION_PRESETS.some((p) => p.id === value);
}

export function loadLastSituation(): StoredSituation | null {
  const raw = memory()?.getItem(LAST_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSituation>;
    if (!isPresetId(parsed.presetId)) return null;
    return {
      presetId: parsed.presetId,
      customLabel: typeof parsed.customLabel === "string" ? parsed.customLabel : "",
      sceneLabel: typeof parsed.sceneLabel === "string" ? parsed.sceneLabel : "",
    };
  } catch {
    return null;
  }
}

export function saveLastSituation(next: StoredSituation): void {
  memory()?.setItem(LAST_KEY, JSON.stringify(next));
}

export function coachOpen(): boolean {
  return memory()?.getItem(COACH_KEY) !== "1";
}

export function dismissCoach(): void {
  memory()?.setItem(COACH_KEY, "1");
}

export function sceneForPreset(
  nextId: SituationPresetId,
  prevId: SituationPresetId | null,
  currentScene: string,
): string {
  const nextHint = presetById(nextId).sceneHint;
  const prevHint = prevId ? presetById(prevId).sceneHint : "";
  if (!currentScene.trim() || currentScene === prevHint) return nextHint;
  return currentScene;
}

export function situationContext(state: {
  presetId: SituationPresetId | null;
  customLabel: string;
  sceneLabel: string;
}): SituationContext | undefined {
  if (!state.presetId) return undefined;
  const preset = presetById(state.presetId);
  const custom = state.customLabel.trim();
  const situation = state.presetId === "other" ? custom || "Other" : preset.label;
  const sceneLabel = state.sceneLabel.trim();
  const note = state.presetId === "other" && custom && custom !== "Other" ? custom : undefined;
  return {
    presetId: state.presetId,
    situation,
    sceneLabel,
    note,
  };
}

/** Night walk if nothing is selected; otherwise last-used / current chip. */
export function ensurePanicPreset(
  selected: SituationPresetId | null,
  last = loadLastSituation(),
): SituationPresetId {
  return selected ?? last?.presetId ?? DEFAULT_PANIC_PRESET;
}

export function situationMeta(ctx?: SituationContext): Record<string, string> {
  if (!ctx) return {};
  const meta: Record<string, string> = {
    presetId: ctx.presetId,
    situation: ctx.situation,
  };
  if (ctx.sceneLabel) meta.sceneLabel = ctx.sceneLabel;
  if (ctx.note) meta.situationNote = ctx.note;
  return meta;
}

export function situationLine(bag: {
  situation?: string;
  sceneLabel?: string;
}): string | null {
  if (bag.situation && bag.sceneLabel) return `${bag.situation} · ${bag.sceneLabel}`;
  return bag.situation || bag.sceneLabel || null;
}

export type PanicCapturePath = "record" | "still" | "fallback";

export function panicCapturePath(opts: {
  camLive: boolean;
  canRecord: boolean;
}): PanicCapturePath {
  if (opts.camLive && opts.canRecord) return "record";
  if (opts.camLive) return "still";
  return "fallback";
}

export function applySituationToBag<T extends Record<string, unknown>>(
  bag: T,
  ctx?: SituationContext,
): T & {
  presetId?: SituationPresetId;
  situation?: string;
  sceneLabel?: string;
  situationNote?: string;
} {
  if (!ctx) return bag;
  return {
    ...bag,
    presetId: ctx.presetId,
    situation: ctx.situation,
    ...(ctx.sceneLabel ? { sceneLabel: ctx.sceneLabel } : {}),
    ...(ctx.note ? { situationNote: ctx.note } : {}),
  };
}
