"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ViewOnceIcon } from "./ViewOnce";

type Facing = "user" | "environment";

const DOUBLE_TAP_MS = 300;

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

/**
 * Snapchat-style camera. Unlike the phone's own camera app, a selfie comes
 * out exactly as it looked on screen (mirrored), and the photo is cropped to
 * what was shown.
 */
export function Camera({
  onSend,
  onPickFromLibrary,
  onClose,
}: {
  onSend: (photo: File, viewOnce: boolean) => void;
  onPickFromLibrary: () => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastTapRef = useRef(0);
  const [facing, setFacing] = useState<Facing>("user");
  const [mirrored, setMirrored] = useState(true);
  const [canFlip, setCanFlip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shot, setShot] = useState<{ file: File; url: string } | null>(null);
  const [viewOnce, setViewOnce] = useState(false);
  const [flash, setFlash] = useState(false);
  // the shutter waits for the first frame (switching cameras takes a moment)
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // phones run one camera at a time: release the current one before asking for the other
    stop(streamRef.current);
    streamRef.current = null;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) return stop(stream);
        streamRef.current = stream;
        // a laptop webcam reports no facing mode: it faces you, so it's mirrored too
        setMirrored(stream.getVideoTracks()[0]?.getSettings().facingMode !== "environment");
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

  // the camera light goes off as soon as the camera is closed
  useEffect(() => () => stop(streamRef.current), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    if (!shot) return;
    return () => URL.revokeObjectURL(shot.url);
  }, [shot]);

  const flip = useCallback(() => {
    if (!canFlip) return;
    setLive(false);
    setFacing((f) => (f === "user" ? "environment" : "user"));
  }, [canFlip]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const { videoWidth: vw, videoHeight: vh } = video;
    // the preview fills the screen (object-fit: cover): keep exactly the part that was visible
    const box = video.getBoundingClientRect();
    const ratio = box.width / box.height;
    let sw = vw;
    let sh = vh;
    if (vw / vh > ratio) sw = vh * ratio;
    else sh = vw / ratio;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw);
    canvas.height = Math.round(sh);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (mirrored) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);

    setFlash(true);
    setTimeout(() => setFlash(false), 120);
    if ("vibrate" in navigator) navigator.vibrate(12);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" });
        setShot({ file, url: URL.createObjectURL(blob) });
      },
      "image/jpeg",
      0.92
    );
  }

  // double-tap the preview to switch cameras, as in Snapchat
  function handlePreviewTap() {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      flip();
    } else {
      lastTapRef.current = now;
    }
  }

  const iconButton =
    "flex h-11 w-11 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition active:scale-90";

  return (
    <div
      className="fixed inset-0 z-[60] bg-black select-none [-webkit-touch-callout:none] [animation:fade-in_150ms_both]"
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
        className={`absolute inset-0 h-full w-full object-cover ${mirrored ? "-scale-x-100" : ""} ${shot ? "invisible" : ""}`}
      />
      {shot && (
        // eslint-disable-next-line @next/next/no-img-element -- the photo just taken (local blob)
        <img src={shot.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
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

      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={shot ? () => setShot(null) : onClose}
          className={iconButton}
          aria-label={shot ? "Retake" : "Close camera"}
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        {!shot && canFlip && (
          <button type="button" onClick={flip} className={iconButton} aria-label="Switch camera">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 9V7a2 2 0 012-2h2l1.5-2h5L16 5h2a2 2 0 012 2v2M20 15v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12a3 3 0 015.2-2M15 12a3 3 0 01-5.2 2M14.5 8v2h-2M9.5 16v-2h2" />
            </svg>
          </button>
        )}
      </div>

      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-8 pb-[max(1.75rem,env(safe-area-inset-bottom))]">
        {shot ? (
          <>
            <button
              type="button"
              onClick={() => setViewOnce((v) => !v)}
              aria-pressed={viewOnce}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-semibold backdrop-blur-sm transition ${
                viewOnce ? "bg-violet-600 text-white" : "bg-black/45 text-white"
              }`}
            >
              <ViewOnceIcon className="h-5 w-5" />
              View once
            </button>
            <button
              type="button"
              onClick={() => onSend(shot.file, viewOnce)}
              className="flex h-14 items-center gap-2 rounded-full bg-violet-600 pl-5 pr-4 text-[15px] font-semibold text-white shadow-lg transition active:scale-95"
            >
              Send
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={onPickFromLibrary} className={iconButton} aria-label="Choose from library">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="16" rx="2.5" strokeWidth={2} />
                <circle cx="8.5" cy="9.5" r="1.5" strokeWidth={2} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15l-5-5L5 20" />
              </svg>
            </button>
            <button
              type="button"
              onClick={capture}
              disabled={!!error || !live}
              className="h-20 w-20 rounded-full border-[5px] border-white bg-white/15 transition active:scale-90 disabled:opacity-30"
              aria-label="Take photo"
            />
            <span className="h-11 w-11" />
          </>
        )}
      </div>
    </div>
  );
}
