"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ACCEPTED_VIDEO_TYPES } from "@/lib/api";
import { canvasToBlob } from "@/lib/images";
import { formatDuration } from "@/lib/media";
import { type Box, NO_EDITS, type SnapEdits, SnapEditor, editsCanvas, hasEdits, renderEdits } from "./SnapEditor";
import { ViewOnceIcon } from "./ViewOnce";

type Facing = "user" | "environment";

/**
 * What the camera hands over: a photo (text and drawings already in it), or a
 * video with its length, first frame and the text and drawings to show on top.
 */
export type CameraCapture = { file: File; durationMs?: number; poster?: Blob | null; overlay?: Blob | null };

type Shot = { file: File; url: string; width: number; height: number } & (
  | { kind: "photo" }
  | { kind: "video"; durationMs: number; poster: Blob | null }
);

/** Where a w × h picture sits when fitted (contained) in the area. */
function fit(area: { w: number; h: number }, w: number, h: number): Box {
  const scale = Math.min(area.w / w, area.h / h);
  const bw = w * scale;
  const bh = h * scale;
  return { x: (area.w - bw) / 2, y: (area.h - bh) / 2, w: bw, h: bh };
}

const DOUBLE_TAP_MS = 300;
/** holding the shutter this long starts a video instead of taking a photo */
const HOLD_MS = 250;
const MAX_RECORDING_MS = 60_000;
/** a hold that barely started recording counts as a photo */
const MIN_RECORDING_MS = 400;
const RECORD_LONG_SIDE = 1280;
const RECORD_FPS = 30;
const VIDEO_BITRATE = 2_500_000;
const POSTER_LONG_SIDE = 960;
const RING_RADIUS = 46;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const HINT_KEY = "camera.recorded";

// MP4 first: it plays everywhere, iPhones included. Chrome and Firefox fall back to WebM.
const RECORDING_TYPES = [
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

const canRecordVideo = () =>
  typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";

function recordingType(): string | undefined {
  return RECORDING_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

function stop(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

function cameraError(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return "Camera access was denied. Allow it in your browser's settings to take photos here.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device.";
  if (!navigator.mediaDevices?.getUserMedia) return "This browser can't use the camera from a web page.";
  return "The camera couldn't be started.";
}

/** Draws the camera frame filling the canvas, mirrored like the preview for selfies. */
function drawFrame(ctx: CanvasRenderingContext2D, video: HTMLVideoElement, mirrored: boolean) {
  const { videoWidth: vw, videoHeight: vh } = video;
  // while switching cameras there's no frame: the last one stays on the canvas
  if (!vw || !vh || video.readyState < 2) return;
  const { width: w, height: h } = ctx.canvas;
  const scale = Math.max(w / vw, h / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.save();
  if (mirrored) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh);
  ctx.restore();
}

function posterOf(canvas: HTMLCanvasElement): Promise<Blob | null> {
  const scale = Math.min(1, POSTER_LONG_SIDE / Math.max(canvas.width, canvas.height));
  const small = document.createElement("canvas");
  small.width = Math.round(canvas.width * scale);
  small.height = Math.round(canvas.height * scale);
  small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height);
  return new Promise((resolve) => small.toBlob(resolve, "image/jpeg", 0.8));
}

function readFlag(): boolean {
  try {
    return localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

type Press = { pointerId: number; timer: ReturnType<typeof setTimeout> | null };

type Recording = {
  recorder: MediaRecorder;
  chunks: Blob[];
  startedAt: number;
  durationMs: number;
  frame: number;
  poster: Promise<Blob | null>;
  autoStop: ReturnType<typeof setTimeout>;
};

/**
 * Snapchat-style camera: tap the shutter for a photo, hold it for a video
 * (up to a minute). A selfie comes out exactly as it looked on screen
 * (mirrored), and the whole camera frame is kept, so nothing is cropped or
 * zoomed. Whatever is sent from here is view once.
 */
export function Camera({
  onSend,
  onPickFromLibrary,
  onClose,
}: {
  onSend: (capture: CameraCapture) => void;
  onPickFromLibrary: () => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const ringRef = useRef<SVGCircleElement>(null);
  const timerRef = useRef<HTMLSpanElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micRef = useRef<Promise<MediaStream | null> | null>(null);
  const mirroredRef = useRef(true);
  const lastTapRef = useRef(0);
  const pressRef = useRef<Press | null>(null);
  const recordingRef = useRef<Recording | null>(null);
  const closedRef = useRef(false);
  const [facing, setFacing] = useState<Facing>("user");
  const [mirrored, setMirrored] = useState(true);
  const [canFlip, setCanFlip] = useState(false);
  const [canRecord] = useState(canRecordVideo);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const [flash, setFlash] = useState(false);
  const [recording, setRecording] = useState(false);
  const [muted, setMuted] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [edits, setEdits] = useState<SnapEdits>(NO_EDITS);
  const [typing, setTyping] = useState(false);
  const [sending, setSending] = useState(false);
  // the camera covers the window (it only opens in the browser, never on the server)
  const [area, setArea] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const rootRef = useRef<HTMLDivElement>(null);
  const typingRef = useRef(false);
  const [showHint, setShowHint] = useState(() => !readFlag());
  // the shutter waits for the first frame (switching cameras takes a moment)
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // phones run one camera at a time: release the current one before asking for the other
    stop(streamRef.current);
    streamRef.current = null;
    (async () => {
      try {
        // the camera's own 16:9 size, in landscape numbers: Safari turns it upright
        // for a phone held vertically. Asking for any other shape (a square, or
        // portrait numbers) makes it crop the picture, which looks zoomed in.
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) return stop(stream);
        streamRef.current = stream;
        // a laptop webcam reports no facing mode: it faces you, so it's mirrored too
        const mirror = stream.getVideoTracks()[0]?.getSettings().facingMode !== "environment";
        mirroredRef.current = mirror;
        setMirrored(mirror);
        if (videoRef.current) videoRef.current.srcObject = stream;
        setError(null);
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (!cancelled) setCanFlip(devices.filter((d) => d.kind === "videoinput").length > 1);
      } catch (err) {
        if (!cancelled) setError(cameraError(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [facing]);

  /** The microphone, asked for once per camera session (null when refused). */
  const microphone = useCallback(() => {
    micRef.current ??= navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((stream) => {
        if (!closedRef.current) return stream;
        stop(stream);
        return null;
      })
      .catch(() => null); // videos are then recorded without sound
    return micRef.current;
  }, []);

  // when the microphone is already allowed, open it now so a hold starts recording at once
  useEffect(() => {
    if (!canRecord) return;
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((p) => {
        if (p.state === "granted") void microphone();
      })
      .catch(() => {});
  }, [canRecord, microphone]);

  // the camera light (and the microphone) go off as soon as the camera is closed
  useEffect(() => {
    closedRef.current = false;
    return () => {
      closedRef.current = true;
      const rec = recordingRef.current;
      recordingRef.current = null;
      if (rec) {
        clearTimeout(rec.autoStop);
        cancelAnimationFrame(rec.frame);
        if (rec.recorder.state !== "inactive") rec.recorder.stop();
      }
      stop(streamRef.current);
      micRef.current?.then(stop);
      micRef.current = null;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !recordingRef.current && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!shot) return;
    return () => URL.revokeObjectURL(shot.url);
  }, [shot]);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (!typingRef.current) setArea({ w: el.clientWidth, h: el.clientHeight });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // while typing, the picture stays put: the keyboard covers it rather than shrinking it
  const handleTyping = useCallback((now: boolean) => {
    typingRef.current = now;
    setTyping(now);
    const el = rootRef.current;
    if (!now && el) setArea({ w: el.clientWidth, h: el.clientHeight });
  }, []);

  // a recorded video plays back with sound; browsers that refuse that get it muted
  useEffect(() => {
    const el = previewRef.current;
    if (shot?.kind !== "video" || !el) return;
    el.muted = false;
    el.play().catch(() => {
      el.muted = true;
      setMuted(true);
      el.play().catch(() => {});
    });
  }, [shot]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const flip = useCallback(() => {
    if (!canFlip) return;
    setLive(false);
    setFacing((f) => (f === "user" ? "environment" : "user"));
  }, [canFlip]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    // the whole frame, as shown (the size the element reports, which is the
    // upright picture even when the track's settings say otherwise)
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawFrame(ctx, video, mirroredRef.current);

    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    if ("vibrate" in navigator) navigator.vibrate(12);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        setEdits(NO_EDITS);
        setShot({ kind: "photo", file, url: URL.createObjectURL(blob), width: canvas.width, height: canvas.height });
      },
      "image/jpeg",
      0.92
    );
  }

  /**
   * Records what the preview shows, drawn onto a canvas: selfies stay
   * mirrored, and switching cameras mid-video doesn't stop the recording.
   */
  async function startRecording(press: Press) {
    const mic = await microphone();
    if (pressRef.current !== press || closedRef.current) {
      // let go while the browser was asking for the microphone
      if (!closedRef.current) setNotice("Hold the button to record a video");
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!video?.videoWidth || !canvas || !ctx) return;

    const scale = Math.min(1, RECORD_LONG_SIDE / Math.max(video.videoWidth, video.videoHeight));
    // video encoders want even sizes
    canvas.width = Math.round((video.videoWidth * scale) / 2) * 2;
    canvas.height = Math.round((video.videoHeight * scale) / 2) * 2;
    drawFrame(ctx, video, mirroredRef.current);

    const stream = canvas.captureStream(RECORD_FPS);
    mic?.getAudioTracks().forEach((t) => stream.addTrack(t));
    const mimeType = recordingType();
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(mimeType && { mimeType }),
        videoBitsPerSecond: VIDEO_BITRATE,
        audioBitsPerSecond: 128_000,
      });
    } catch {
      stream.getVideoTracks().forEach((t) => t.stop());
      setNotice("This browser can't record videos.");
      return;
    }

    const rec: Recording = {
      recorder,
      chunks: [],
      startedAt: performance.now(),
      durationMs: 0,
      frame: 0,
      poster: posterOf(canvas),
      autoStop: setTimeout(() => {
        pressRef.current = null;
        stopRecording();
      }, MAX_RECORDING_MS),
    };
    recordingRef.current = rec;

    recorder.ondataavailable = (e) => {
      if (e.data.size) rec.chunks.push(e.data);
    };
    recorder.onstop = async () => {
      cancelAnimationFrame(rec.frame);
      // the canvas track only: the microphone stays open for the next video
      stream.getVideoTracks().forEach((t) => t.stop());
      if (closedRef.current) return;
      if (rec.durationMs < MIN_RECORDING_MS) {
        capture();
        return;
      }
      const type = (recorder.mimeType || mimeType || "video/webm").split(";")[0];
      const blob = new Blob(rec.chunks, { type });
      if (!blob.size || !ACCEPTED_VIDEO_TYPES.includes(type)) {
        setNotice("The video couldn't be recorded.");
        return;
      }
      const file = new File([blob], `video-${Date.now()}.${type === "video/mp4" ? "mp4" : "webm"}`, { type });
      const poster = await rec.poster;
      if (closedRef.current) return;
      setEdits(NO_EDITS);
      setShot({
        kind: "video",
        file,
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
        durationMs: rec.durationMs,
        poster,
      });
      setMuted(false);
      if (showHint) {
        setShowHint(false);
        try {
          localStorage.setItem(HINT_KEY, "1");
        } catch {
          /* the hint just shows again next time */
        }
      }
    };

    let lastSecond = -1;
    let lastDraw = 0;
    const tick = (now: number) => {
      // 120 Hz screens call this twice as often as the video needs frames
      if (now - lastDraw >= 1000 / RECORD_FPS - 4) {
        lastDraw = now;
        drawFrame(ctx, video, mirroredRef.current);
      }
      const elapsed = now - rec.startedAt;
      // progress and timer are written straight to the DOM: no re-render per frame
      ringRef.current?.style.setProperty(
        "stroke-dashoffset",
        String(RING_LENGTH * (1 - Math.min(1, elapsed / MAX_RECORDING_MS)))
      );
      const second = Math.floor(elapsed / 1000);
      if (second !== lastSecond && timerRef.current) {
        lastSecond = second;
        timerRef.current.textContent = formatDuration(second * 1000);
      }
      rec.frame = requestAnimationFrame(tick);
    };
    rec.frame = requestAnimationFrame(tick);

    recorder.start(1000);
    setRecording(true);
    if ("vibrate" in navigator) navigator.vibrate(20);
  }

  function stopRecording() {
    const rec = recordingRef.current;
    if (!rec) return;
    recordingRef.current = null;
    clearTimeout(rec.autoStop);
    rec.durationMs = performance.now() - rec.startedAt;
    if (rec.recorder.state !== "inactive") rec.recorder.stop();
    setRecording(false);
  }

  // leaving the app mid-video ends it (the camera freezes in the background anyway)
  useEffect(() => {
    if (!recording) return;
    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      pressRef.current = null;
      stopRecording();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  });

  function handleShutterDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (e.button !== 0 || pressRef.current || recordingRef.current || error || !live) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* the release is still caught on the button */
    }
    const press: Press = { pointerId: e.pointerId, timer: null };
    pressRef.current = press;
    if (canRecord) {
      press.timer = setTimeout(() => {
        press.timer = null;
        void startRecording(press);
      }, HOLD_MS);
    }
  }

  function handleShutterUp(e: React.PointerEvent<HTMLButtonElement>, cancelled = false) {
    const press = pressRef.current;
    if (!press || press.pointerId !== e.pointerId) return;
    pressRef.current = null;
    if (press.timer) {
      clearTimeout(press.timer);
      if (!cancelled) capture();
      return;
    }
    // a video keeps what was filmed even when the touch is interrupted
    stopRecording();
  }

  // double-tap the preview to switch cameras, as in Snapchat (works while filming too)
  function handlePreviewTap() {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      flip();
    } else {
      lastTapRef.current = now;
    }
  }

  function toggleMute() {
    const el = previewRef.current;
    if (!el) return;
    el.muted = !muted;
    setMuted(!muted);
  }

  /** Photos get the text and drawings painted in; videos carry them as a see-through layer. */
  async function send() {
    if (!shot || sending) return;
    if (!hasEdits(edits)) {
      onSend(shot.kind === "video" ? { file: shot.file, durationMs: shot.durationMs, poster: shot.poster } : { file: shot.file });
      return;
    }
    setSending(true);
    try {
      if (shot.kind === "video") {
        const overlay = await canvasToBlob(editsCanvas(edits, shot.width, shot.height), "image/png", 1);
        onSend({ file: shot.file, durationMs: shot.durationMs, poster: shot.poster, overlay });
        return;
      }
      const photo = await createImageBitmap(shot.file);
      const canvas = document.createElement("canvas");
      canvas.width = shot.width;
      canvas.height = shot.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas");
      ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
      photo.close();
      renderEdits(ctx, edits, canvas.width, canvas.height);
      const blob = await canvasToBlob(canvas, "image/jpeg", 0.92);
      if (!blob) throw new Error("no image");
      onSend({ file: new File([blob], shot.file.name, { type: "image/jpeg" }) });
    } catch {
      setNotice("It couldn't be prepared. Try again.");
      setSending(false);
    }
  }

  function retake() {
    setShot(null);
    setEdits(NO_EDITS);
  }

  const box = shot ? fit(area, shot.width, shot.height) : null;
  const boxStyle = box ? { left: box.x, top: box.y, width: box.w, height: box.h } : undefined;

  const iconButton =
    "flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition active:scale-90";

  return (
    <div
      ref={rootRef}
      className="fixed inset-0 z-[60] overflow-hidden bg-black select-none [-webkit-touch-callout:none] [animation:fade-in_150ms_both]"
      role="dialog"
      aria-modal="true"
      aria-label="Camera"
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onPlaying={() => setLive(true)}
        onPointerUp={handlePreviewTap}
        className={`absolute inset-0 h-full w-full object-contain ${mirrored ? "-scale-x-100" : ""} ${shot ? "invisible" : ""}`}
      />
      {/* the recording is drawn here; some browsers only stream a canvas that's in the page */}
      <canvas ref={canvasRef} aria-hidden className="pointer-events-none absolute left-0 top-0 h-px w-px opacity-0" />
      {shot?.kind === "photo" && (
        // eslint-disable-next-line @next/next/no-img-element -- the photo just taken (local blob)
        <img src={shot.url} alt="" className="absolute" style={boxStyle} />
      )}
      {shot?.kind === "video" && (
        <video
          ref={previewRef}
          src={shot.url}
          loop
          playsInline
          className="absolute"
          style={boxStyle}
        />
      )}
      {box && <SnapEditor box={box} edits={edits} onChange={setEdits} onEditingChange={handleTyping} />}
      {flash && <div className="pointer-events-none absolute inset-0 bg-white/80" />}

      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-sm text-neutral-300">{error}</p>
          <button
            type="button"
            onClick={onPickFromLibrary}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black"
          >
            Choose from library
          </button>
        </div>
      )}

      <div
        className={`absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] ${
          typing ? "invisible" : ""
        }`}
      >
        {recording ? (
          <span className="h-11 w-11" />
        ) : (
          <button
            type="button"
            onClick={shot ? retake : onClose}
            className={iconButton}
            aria-label={shot ? "Retake" : "Close camera"}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
        {recording && (
          <span className="inline-flex items-center gap-2 rounded-full bg-black/45 px-3 py-1.5 text-sm font-semibold tabular-nums text-white backdrop-blur-sm">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
            <span ref={timerRef}>0:00</span>
          </span>
        )}
        {shot?.kind === "video" ? (
          <button
            type="button"
            onClick={toggleMute}
            className={iconButton}
            aria-label={muted ? "Turn sound on" : "Turn sound off"}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H3v6h3l5 4V5z" />
              {muted ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9l4 6M21 9l-4 6" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.5 8.5a5 5 0 010 7M18.5 5.5a9 9 0 010 13" />
              )}
            </svg>
          </button>
        ) : !shot && canFlip ? (
          <button type="button" onClick={flip} className={iconButton} aria-label="Switch camera">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 9V7a2 2 0 012-2h2l1.5-2h5L16 5h2a2 2 0 012 2v2M20 15v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12a3 3 0 015.2-2M15 12a3 3 0 01-5.2 2M14.5 8v2h-2M9.5 16v-2h2" />
            </svg>
          </button>
        ) : (
          <span className="h-11 w-11" />
        )}
      </div>

      {notice && (
        <p className="pointer-events-none absolute inset-x-0 bottom-36 mx-auto w-fit rounded-full bg-black/60 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm [animation:fade-in_150ms_both]">
          {notice}
        </p>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 px-8 pb-[max(1.75rem,env(safe-area-inset-bottom))] ${typing ? "invisible" : ""}`}
      >
        {!shot && !recording && !error && live && canRecord && showHint && !notice && (
          <p className="pointer-events-none mb-4 text-center text-[13px] font-medium text-white/80 [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]">
            Tap for a photo, hold for a video
          </p>
        )}
        <div className="flex items-center justify-between">
          {shot ? (
            <>
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm"
                title="It disappears once it's been opened"
              >
                <ViewOnceIcon className="h-5 w-5" />
                View once
              </span>
              <button
                type="button"
                onClick={send}
                disabled={sending}
                className="flex h-14 items-center gap-2 rounded-full bg-violet-600 pl-5 pr-4 text-[15px] font-semibold text-white shadow-lg transition active:scale-95 disabled:opacity-60"
              >
                Send
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </>
          ) : (
            <>
              {recording ? (
                <span className="h-11 w-11" />
              ) : (
                <button type="button" onClick={onPickFromLibrary} className={iconButton} aria-label="Choose from library">
                  <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="16" rx="2.5" strokeWidth={2} />
                    <circle cx="8.5" cy="9.5" r="1.5" strokeWidth={2} />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15l-5-5L5 20" />
                  </svg>
                </button>
              )}
              <div className="relative flex h-24 w-24 items-center justify-center">
                {recording && (
                  <svg className="pointer-events-none absolute inset-0 -rotate-90" viewBox="0 0 100 100" aria-hidden>
                    <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="rgb(255 255 255 / 0.25)" strokeWidth="5" />
                    <circle
                      ref={ringRef}
                      cx="50"
                      cy="50"
                      r={RING_RADIUS}
                      fill="none"
                      stroke="#ef4444"
                      strokeWidth="5"
                      strokeLinecap="round"
                      strokeDasharray={RING_LENGTH}
                      strokeDashoffset={RING_LENGTH}
                    />
                  </svg>
                )}
                <button
                  type="button"
                  onPointerDown={handleShutterDown}
                  onPointerUp={(e) => handleShutterUp(e)}
                  onPointerCancel={(e) => handleShutterUp(e, true)}
                  onContextMenu={(e) => e.preventDefault()}
                  // keyboards (Enter / Space) click with detail 0: that's a photo
                  onClick={(e) => {
                    if (e.detail === 0 && !recordingRef.current) capture();
                  }}
                  disabled={!!error || (!live && !recording)}
                  className={`touch-none rounded-full transition-all duration-200 disabled:opacity-30 ${
                    recording
                      ? "h-[4.5rem] w-[4.5rem] border-0 bg-red-500/90"
                      : "h-20 w-20 border-[5px] border-white bg-white/15 active:scale-90"
                  }`}
                  aria-label={canRecord ? "Take photo (hold to record a video)" : "Take photo"}
                />
              </div>
              <span className="h-11 w-11" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
