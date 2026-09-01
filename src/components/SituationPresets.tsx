import {
  SITUATION_PRESETS,
  type SituationPresetId,
} from "../lib/situation";

type Props = {
  presetId: SituationPresetId | null;
  customLabel: string;
  sceneLabel: string;
  coach: boolean;
  onSelect: (id: SituationPresetId) => void;
  onCustomLabel: (value: string) => void;
  onSceneLabel: (value: string) => void;
  onDismissCoach: () => void;
};

export function SituationPresets({
  presetId,
  customLabel,
  sceneLabel,
  coach,
  onSelect,
  onCustomLabel,
  onSceneLabel,
  onDismissCoach,
}: Props) {
  return (
    <div className="situation-block">
      <p className="kicker">Situation</p>
      <div
        className="presets"
        data-testid="situation-presets"
        role="listbox"
        aria-label="Situation presets"
      >
        {SITUATION_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            role="option"
            aria-selected={presetId === preset.id}
            className={`preset-chip${presetId === preset.id ? " is-on" : ""}`}
            onClick={() => onSelect(preset.id)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      {presetId === "other" && (
        <label className="field">
          <span>Situation label</span>
          <input
            name="situationOther"
            value={customLabel}
            onChange={(e) => onCustomLabel(e.target.value)}
            placeholder="Describe the scene"
            maxLength={80}
          />
        </label>
      )}
      <label className="field">
        <span>Scene label</span>
        <input
          name="sceneLabel"
          value={sceneLabel}
          onChange={(e) => onSceneLabel(e.target.value)}
          placeholder="Apt hallway"
          maxLength={80}
        />
      </label>
      {coach && (
        <div className="coach" data-testid="situation-coach">
          <p>
            Tag the bag so counsel sees the scene. <strong>Panic</strong> captures and
            seals in one tap — same crypto, no upload.
          </p>
          <button type="button" className="btn btn-ghost" onClick={onDismissCoach}>
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
