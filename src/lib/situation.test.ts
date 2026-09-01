import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PANIC_PRESET,
  applySituationToBag,
  ensurePanicPreset,
  panicCapturePath,
  sceneForPreset,
  situationContext,
  situationLine,
  situationMeta,
  saveLastSituation,
  loadLastSituation,
} from "./situation";

const mem = new Map<string, string>();

afterEach(() => {
  mem.clear();
});

function installMemoryStorage() {
  const storage: Storage = {
    get length() {
      return mem.size;
    },
    clear: () => mem.clear(),
    getItem: (key) => mem.get(key) ?? null,
    setItem: (key, value) => {
      mem.set(key, String(value));
    },
    removeItem: (key) => {
      mem.delete(key);
    },
    key: (index) => [...mem.keys()][index] ?? null,
  };
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
  });
}

describe("situation presets", () => {
  it("prefills scene hints without clobbering a custom pin", () => {
    expect(sceneForPreset("landlord", null, "")).toBe("Apt hallway");
    expect(sceneForPreset("delivery", "landlord", "Apt hallway")).toBe("Porch delivery");
    expect(sceneForPreset("delivery", "landlord", "Unit 4B stairwell")).toBe(
      "Unit 4B stairwell",
    );
  });

  it("stores situation, presetId, and scene on bag + CAPTURED meta", () => {
    const ctx = situationContext({
      presetId: "landlord",
      customLabel: "",
      sceneLabel: "Apt hallway",
    });
    expect(ctx).toMatchObject({
      presetId: "landlord",
      situation: "Landlord",
      sceneLabel: "Apt hallway",
    });
    expect(situationMeta(ctx)).toEqual({
      presetId: "landlord",
      situation: "Landlord",
      sceneLabel: "Apt hallway",
    });
    const bag = applySituationToBag({ id: "WC-TEST" }, ctx);
    expect(bag.situation).toBe("Landlord");
    expect(bag.presetId).toBe("landlord");
    expect(bag.sceneLabel).toBe("Apt hallway");
    expect(situationLine(bag)).toBe("Landlord · Apt hallway");
  });

  it("uses Other free-text as the situation label", () => {
    const ctx = situationContext({
      presetId: "other",
      customLabel: "Neighbor dispute",
      sceneLabel: "Front walk",
    });
    expect(ctx?.situation).toBe("Neighbor dispute");
    expect(situationMeta(ctx).situationNote).toBe("Neighbor dispute");
  });

  it("defaults Panic to Night walk unless a last-used preset exists", () => {
    expect(ensurePanicPreset(null, null)).toBe(DEFAULT_PANIC_PRESET);
    expect(ensurePanicPreset(null, { presetId: "delivery", customLabel: "", sceneLabel: "" })).toBe(
      "delivery",
    );
    expect(ensurePanicPreset("workplace", { presetId: "delivery", customLabel: "", sceneLabel: "" })).toBe(
      "workplace",
    );
  });

  it("persists last-used preset per device", () => {
    installMemoryStorage();
    saveLastSituation({
      presetId: "roadside",
      customLabel: "",
      sceneLabel: "Shoulder",
    });
    expect(loadLastSituation()).toEqual({
      presetId: "roadside",
      customLabel: "",
      sceneLabel: "Shoulder",
    });
  });

  it("picks record, still, or fallback for Panic", () => {
    expect(panicCapturePath({ camLive: true, canRecord: true })).toBe("record");
    expect(panicCapturePath({ camLive: true, canRecord: false })).toBe("still");
    expect(panicCapturePath({ camLive: false, canRecord: false })).toBe("fallback");
  });
});
