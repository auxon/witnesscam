import { useEffect, useRef, useState } from "react";
import { CustodyStrip } from "./CustodyStrip";
import { formatBytes } from "../lib/bytes";
import { getDevice, holderFromDevice, setHolderName } from "../lib/device";
import { navigate } from "../lib/router";
import { makeSampleStill } from "../lib/sampleStill";
import { sealEvidence, type SealProgress } from "../lib/seal";
import { useBilling } from "../lib/billing";
import type { MediaKind } from "../lib/types";

type Draft = {
  bytes: ArrayBuffer;
  kind: MediaKind;
  mimeType: string;
  filename: string;
  previewUrl: string;
};

export function CaptureStudio() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);

  const [cam, setCam] = useState<"pending" | "live" | "blocked">("pending");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sealing, setSealing] = useState(false);
  const [step, setStep] = useState<SealProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [holderName, setHolder] = useState(
    () => holderFromDevice(getDevice()).holderName,
  );
  const { requireProForSeal, remaining, entitlement, refresh } = useBilling();

  useEffect(() => {
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
  }, []);

  function setPreview(next: Draft) {
    setDraft((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return next;
    });
    setError(null);
  }

  async function grabStill() {
    const video = videoRef.current;
    if (!video || cam !== "live") {
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
    setPreview({
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
    recorder.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mime });
      setPreview({
        bytes: await blob.arrayBuffer(),
        kind: "video",
        mimeType: blob.type,
        filename: `witness-${Date.now()}.webm`,
        previewUrl: URL.createObjectURL(blob),
      });
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
    setPreview({
      bytes: await file.arrayBuffer(),
      kind,
      mimeType: file.type || "application/octet-stream",
      filename: file.name,
      previewUrl: URL.createObjectURL(file),
    });
  }

  async function onSample() {
    const sample = await makeSampleStill();
    setPreview({
      bytes: sample.bytes,
      kind: "still",
      mimeType: sample.mimeType,
      filename: sample.filename,
      previewUrl: sample.previewUrl,
    });
  }

  async function onSeal() {
    if (!draft) return;
    if (!requireProForSeal()) return;
    setHolderName(holderName);
    setSealing(true);
    setError(null);
    try {
      const bag = await sealEvidence({
        bytes: draft.bytes,
        kind: draft.kind,
        mimeType: draft.mimeType,
        filename: draft.filename,
        onProgress: setStep,
      });
      await refresh();
      navigate({ name: "bag", id: bag.id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Seal failed");
      setSealing(false);
      setStep(null);
    }
  }

  return (
    <section className="studio">
      <div className="viewfinder-wrap">
        <div className={`viewfinder ${recording ? "is-recording" : ""}`}>
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
            {recording && <span className="rec">REC {String(elapsed).padStart(2, "0")}s / 15s</span>}
          </div>
        </div>
        {cam === "blocked" && !draft && (
          <p className="hint">
            This device has no camera permission. Seal a file or generate a sample still — the
            cryptographic path is identical.
          </p>
        )}
      </div>

      <aside className="studio-side">
        <p className="kicker">Chain of custody</p>
        <h2>Seal it like a lab sample.</h2>
        <p className="lede">
          Plaintext never leaves this browser. SHA-256 binds the pixels. AES-256-GCM bags them.
          An OP_RETURN commits the digest and the custody tip.
          {entitlement.pro
            ? " Pro is on — seal without a bag cap."
            : ` ${remaining} free seal${remaining === 1 ? "" : "s"} left on this device.`}
        </p>
        <CustodyStrip liveStep={step ?? undefined} />
        <label className="field">
          <span>Holder name</span>
          <input
            value={holderName}
            onChange={(e) => setHolder(e.target.value)}
            maxLength={80}
          />
        </label>
        <div className="actions">
          {!draft && (
            <>
              {recording ? (
                <button className="btn btn-danger" onClick={stopRecording}>
                  Stop
                </button>
              ) : (
                <button className="btn btn-amber" onClick={startRecording} disabled={cam !== "live"}>
                  Record 15s
                </button>
              )}
              <button className="btn" onClick={grabStill} disabled={cam !== "live"}>
                Still
              </button>
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
              <button className="btn btn-amber" onClick={() => void onSeal()}>
                Seal evidence · {formatBytes(draft.bytes.byteLength)}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
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
