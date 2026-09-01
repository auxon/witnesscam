import { useEffect, useRef, useState } from "react";
import { CustodyStrip } from "./CustodyStrip";
import { SituationPresets } from "./SituationPresets";
import { formatBytes } from "../lib/bytes";
import { getDevice, holderFromDevice, setHolderName } from "../lib/device";
import { navigate } from "../lib/router";
import { makeSampleStill } from "../lib/sampleStill";
import { sealEvidence, type SealProgress } from "../lib/seal";
import {
  coachOpen,
  dismissCoach,
  ensurePanicPreset,
  loadLastSituation,
  panicCapturePath,
  saveLastSituation,
  sceneForPreset,
  situationContext,
  type SituationPresetId,
} from "../lib/situation";
import { useBilling } from "../lib/billing";
import { useWallet } from "../lib/wallet";
import type { MediaKind } from "../lib/types";

type Draft = {
  bytes: ArrayBuffer;
  kind: MediaKind;
  mimeType: string;
  filename: string;
  previewUrl: string;
};

function vibrate() {
  try {
    navigator.vibrate?.(40);
  } catch {
    /* ignore */
  }
}

export function CaptureStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const panicRef = useRef(false);
  const camRef = useRef<"pending" | "live" | "blocked">("pending");

  const last = loadLastSituation();
  const [cam, setCam] = useState<"pending" | "live" | "blocked">("pending");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sealing, setSealing] = useState(false);
  const [step, setStep] = useState<SealProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [panicFallback, setPanicFallback] = useState(false);
  const [panicArmed, setPanicArmed] = useState(false);
  const [coach, setCoach] = useState(() => coachOpen());
  const [presetId, setPresetId] = useState<SituationPresetId | null>(
    () => last?.presetId ?? null,
  );
  const [customLabel, setCustomLabel] = useState(() => last?.customLabel ?? "");
  const [sceneLabel, setSceneLabel] = useState(() => last?.sceneLabel ?? "");
  const [holderName, setHolder] = useState(
    () => holderFromDevice(getDevice()).holderName,
  );
  const { requireProForSeal, remaining, entitlement, refresh } = useBilling();
  const wallet = useWallet();

  const field = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
  camRef.current = cam;

  const situationState = { presetId, customLabel, sceneLabel };
  const situationRef = useRef(situationState);
  situationRef.current = situationState;
  const holderRef = useRef(holderName);
  holderRef.current = holderName;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const sealingRef = useRef(sealing);
  sealingRef.current = sealing;

  useEffect(() => {
    if (field) {
      setCam("blocked");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
        setCam("live");
      } catch {
        if (!cancelled) setCam("blocked");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [field]);

  function persistSituation(next: {
    presetId: SituationPresetId | null;
    customLabel: string;
    sceneLabel: string;
  }) {
    if (!next.presetId) return;
    saveLastSituation({
      presetId: next.presetId,
      customLabel: next.customLabel,
      sceneLabel: next.sceneLabel,
    });
  }

  function selectPreset(id: SituationPresetId) {
    const nextScene = sceneForPreset(id, presetId, sceneLabel);
    setPresetId(id);
    setSceneLabel(nextScene);
    situationRef.current = { presetId: id, customLabel, sceneLabel: nextScene };
    persistSituation({ presetId: id, customLabel, sceneLabel: nextScene });
  }

  function applyPanicPreset() {
    const id = ensurePanicPreset(situationRef.current.presetId);
    if (id === situationRef.current.presetId) {
      persistSituation(situationRef.current);
      return;
    }
    const nextScene = sceneForPreset(
      id,
      situationRef.current.presetId,
      situationRef.current.sceneLabel,
    );
    const next = {
      presetId: id,
      customLabel: situationRef.current.customLabel,
      sceneLabel: nextScene,
    };
    setPresetId(id);
    setSceneLabel(nextScene);
    situationRef.current = next;
    persistSituation(next);
  }

  async function startLive() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCam("live");
      setError(null);
    } catch {
      setCam("blocked");
      setError("Camera permission denied. Use Phone camera to capture from the OS picker.");
    }
  }

  function setPreview(next: Draft) {
    setDraft((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return next;
    });
    setError(null);
  }

  async function finishCapture(next: Draft) {
    setPreview(next);
    if (panicRef.current) {
      await sealNow(next);
    }
  }

  async function grabStill() {
    const video = videoRef.current;
    if (!video || camRef.current !== "live") {
      setError("Camera is not live. Use upload or sample still.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("still failed"))),
        "image/jpeg",
        0.92,
      );
    });
    await finishCapture({
      bytes: await blob.arrayBuffer(),
      kind: "still",
      mimeType: "image/jpeg",
      filename: `witness-${Date.now()}.jpg`,
      previewUrl: URL.createObjectURL(blob),
    });
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) {
      setError("Camera is not live. Use upload or sample still.");
      return;
    }
    chunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm";
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunksRef.current.push(ev.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      void (async () => {
        await finishCapture({
          bytes: await blob.arrayBuffer(),
          kind: "video",
          mimeType: blob.type,
          filename: `witness-${Date.now()}.webm`,
          previewUrl: URL.createObjectURL(blob),
        });
      })();
    };
    recorder.start(200);
    recorderRef.current = recorder;
    setRecording(true);
    setElapsed(0);
    const started = Date.now();
    timerRef.current = window.setInterval(() => {
      const sec = Math.floor((Date.now() - started) / 1000);
      setElapsed(sec);
      if (sec >= 15) stopRecording();
    }, 200);
  }

  async function onFile(file: File) {
    const kind: MediaKind = file.type.startsWith("video/") ? "video" : "still";
    await finishCapture({
      bytes: await file.arrayBuffer(),
      kind,
      mimeType: file.type || "application/octet-stream",
      filename: file.name,
      previewUrl: URL.createObjectURL(file),
    });
  }

  async function onSample() {
    const sample = await makeSampleStill();
    await finishCapture({
      bytes: sample.bytes,
      kind: "still",
      mimeType: sample.mimeType,
      filename: sample.filename,
      previewUrl: sample.previewUrl,
    });
  }

  async function sealNow(next: Draft) {
    if (sealingRef.current) return;
    if (!requireProForSeal()) {
      panicRef.current = false;
      setPanicArmed(false);
      setSealing(false);
      return;
    }
    setHolderName(holderRef.current);
    setSealing(true);
    sealingRef.current = true;
    setError(null);
    try {
      const bag = await sealEvidence({
        bytes: next.bytes,
        kind: next.kind,
        mimeType: next.mimeType,
        filename: next.filename,
        situation: situationContext(situationRef.current),
        onProgress: setStep,
      });
      panicRef.current = false;
      setPanicArmed(false);
      await refresh();
      navigate({ name: "bag", id: bag.id });
    } catch (err) {
      panicRef.current = false;
      setPanicArmed(false);
      setError(err instanceof Error ? err.message : "Seal failed");
      setSealing(false);
      sealingRef.current = false;
      setStep(null);
    }
  }

  async function onSeal() {
    if (!draft) return;
    await sealNow(draft);
  }

  async function waitForLive(ms: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < ms) {
      if (camRef.current === "live" && streamRef.current) return true;
      if (camRef.current === "blocked") return false;
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }
    return camRef.current === "live" && Boolean(streamRef.current);
  }

  async function onPanic() {
    if (sealingRef.current || recording) return;
    if (!requireProForSeal()) return;
    vibrate();
    applyPanicPreset();
    panicRef.current = true;
    setPanicArmed(true);
    setPanicFallback(false);
    setError(null);

    if (draftRef.current) {
      await sealNow(draftRef.current);
      return;
    }

    if (camRef.current === "pending") {
      await waitForLive(1500);
    }

    const canRecord =
      Boolean(streamRef.current) &&
      typeof MediaRecorder !== "undefined" &&
      camRef.current === "live";
    const path = panicCapturePath({
      camLive: camRef.current === "live" && Boolean(streamRef.current),
      canRecord,
    });

    if (path === "record") {
      startRecording();
      return;
    }
    if (path === "still") {
      await grabStill();
      return;
    }
    setPanicFallback(true);
  }

  const situationChip = situationContext(situationState);

  return (
    <section className="studio">
      <div className="viewfinder-wrap">
        <div className={`viewfinder ${recording ? "is-recording" : ""} ${panicArmed ? "is-panic" : ""}`}>
          <video
            ref={videoRef}
            className={draft ? "is-hidden" : ""}
            playsInline
            muted
            autoPlay
          />
          {draft &&
            (draft.kind === "video" ? (
              <video src={draft.previewUrl} controls playsInline />
            ) : (
              <img src={draft.previewUrl} alt="Captured evidence preview" />
            ))}
          <div className="hud hud-tl" />
          <div className="hud hud-tr" />
          <div className="hud hud-bl" />
          <div className="hud hud-br" />
          <div className="hud-meta">
            <span>{cam === "live" ? "CAM LIVE" : cam === "blocked" ? "NO CAMERA" : "CAM…"}</span>
            <span>{draft ? draft.kind.toUpperCase() : "UNSEALED"}</span>
            {situationChip && <span>{situationChip.situation.toUpperCase()}</span>}
            {recording && (
              <span className="rec">
                {panicArmed ? "PANIC " : ""}REC {String(elapsed).padStart(2, "0")}s / 15s
              </span>
            )}
          </div>
        </div>
        {cam === "blocked" && !draft && (
          <p className="hint">
            {field
              ? "Use Phone camera below. Add WitnessCam to your Home Screen so this page behaves like an app in the field."
              : "This device has no camera permission. Seal a file or generate a sample still — the cryptographic path is identical."}
          </p>
        )}
      </div>

      <aside className="studio-side">
        <p className="kicker">Chain of custody</p>
        <h2>Seal it like a lab sample.</h2>
        <p className="lede">
          Plaintext never leaves this browser. SHA-256 binds the pixels. AES-256-GCM bags them.
          An RFC 3161 timestamp from DigiCert or Sectigo is the clock of record — the same
          standard used in code signing. Counsel does not have to explain a coin.
          {wallet.connected || wallet.sidecar
            ? " Yours is connected, so a public bulletin is added on BSV as well."
            : " Connect Yours only if you also want a public bulletin board entry."}
          {entitlement.org
            ? ` Sealing as ${entitlement.org.name}.`
            : " Create an org so field phones share one Pro license."}
          {entitlement.pro
            ? " Pro is on — seal without a bag cap."
            : ` ${remaining} free seal${remaining === 1 ? "" : "s"} left on this device.`}
        </p>
        <SituationPresets
          presetId={presetId}
          customLabel={customLabel}
          sceneLabel={sceneLabel}
          coach={coach}
          onSelect={selectPreset}
          onCustomLabel={(value) => {
            setCustomLabel(value);
            persistSituation({ presetId, customLabel: value, sceneLabel });
          }}
          onSceneLabel={(value) => {
            setSceneLabel(value);
            persistSituation({ presetId, customLabel, sceneLabel: value });
          }}
          onDismissCoach={() => {
            dismissCoach();
            setCoach(false);
          }}
        />
        <CustodyStrip liveStep={step ?? undefined} />
        <label className="field">
          <span>Holder name</span>
          <input
            name="holderName"
            value={holderName}
            onChange={(e) => setHolder(e.target.value)}
            maxLength={80}
          />
        </label>
        <div className="panic-dock">
          <button
            type="button"
            className="btn btn-panic"
            data-testid="panic-button"
            aria-label="Panic seal — capture and seal immediately"
            onClick={() => void onPanic()}
            disabled={sealing}
          >
            Panic
          </button>
        </div>
        {panicFallback && !draft && !sealing && (
          <div className="panic-fallback" data-testid="panic-fallback" data-panic-fallback>
            <p>
              No live camera. Capture now with Phone camera or Sample still — sealing starts as
              soon as the file lands. Same AES-256-GCM and RFC 3161 path.
            </p>
            <div className="actions">
              <label className="btn btn-amber">
                Phone camera
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <button type="button" className="btn" onClick={() => void onSample()}>
                Sample still
              </button>
            </div>
          </div>
        )}
        <div className="actions">
          {!draft && (
            <>
              {cam !== "live" && (
                <button className="btn" onClick={() => void startLive()}>
                  Live viewfinder
                </button>
              )}
              {recording ? (
                <button className="btn btn-danger" onClick={stopRecording}>
                  Stop
                </button>
              ) : (
                <button className="btn btn-amber" onClick={startRecording} disabled={cam !== "live"}>
                  Record 15s
                </button>
              )}
              <button className="btn" onClick={() => void grabStill()} disabled={cam !== "live"}>
                Still
              </button>
              <label className="btn btn-amber">
                Phone camera
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="btn">
                Phone video
                <input
                  type="file"
                  accept="video/*"
                  capture="environment"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <label className="btn btn-ghost">
                Upload
                <input
                  type="file"
                  accept="image/*,video/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void onFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <button className="btn btn-ghost" onClick={() => void onSample()}>
                Sample still
              </button>
            </>
          )}
          {draft && !sealing && (
            <>
              <button
                className={`btn btn-amber${panicArmed ? " btn-seal-now" : ""}`}
                onClick={() => void onSeal()}
              >
                {panicArmed ? "Seal now" : `Seal evidence · ${formatBytes(draft.bytes.byteLength)}`}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  panicRef.current = false;
                  setPanicArmed(false);
                  setPanicFallback(false);
                  setDraft(null);
                  setStep(null);
                }}
              >
                Discard
              </button>
            </>
          )}
          {sealing && <p className="sealing-copy">Sealing on-device… {step}</p>}
        </div>
        {error && <p className="error">{error}</p>}
      </aside>
    </section>
  );
}
