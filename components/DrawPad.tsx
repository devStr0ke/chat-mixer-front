"use client";

import { useEffect, useRef, useState } from "react";

type Brush = "pen" | "neon" | "eraser";
type Point = { x: number; y: number };
type Stroke = { brush: Brush; color: string; size: number; points: Point[] };

const COLORS = ["#ffffff", "#111111", "#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];
const SIZES = [4, 9, 16];
const MAX_SIDE = 2048; // longest side of the image that's sent (px)

/** Draws one stroke, smoothed through the midpoints of its points. */
function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const pts = s.points;
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    if (pts.length === 1) ctx.lineTo(pts[0].x + 0.01, pts[0].y); // a dot
    for (let i = 1; i < pts.length - 1; i++) {
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, (pts[i].x + pts[i + 1].x) / 2, (pts[i].y + pts[i + 1].y) / 2);
    }
    if (pts.length > 1) ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.brush === "eraser") {
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineWidth = s.size * 2.5;
    ctx.strokeStyle = "#000";
    trace();
    ctx.stroke();
  } else if (s.brush === "neon") {
    // a colored glow with a bright core, like Instagram's neon pen
    ctx.shadowColor = s.color;
    ctx.shadowBlur = s.size * 2.2;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    trace();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = Math.max(1.5, s.size * 0.35);
    trace();
    ctx.stroke();
  } else {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    trace();
    ctx.stroke();
  }
  ctx.restore();
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
}

/**
 * Draw over the conversation and send the drawing, as on Instagram: pen,
 * neon and eraser, colors, three sizes, undo. What's sent keeps the full width
 * of the screen (so strokes stay where they were drawn) with the empty space
 * above and below trimmed, on a transparent background.
 */
export function DrawPad({
  onSend,
  onClose,
}: {
  /** `display`: the drawing's size on screen, the size it's shown at */
  onSend: (image: Blob, display: { width: number; height: number }) => Promise<void>;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // finished strokes, drawn once into an offscreen canvas
  const committedRef = useRef<HTMLCanvasElement | null>(null);
  const current = useRef<{ stroke: Stroke; pointerId: number } | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [brush, setBrush] = useState<Brush>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dims, setDims] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));

  useEffect(() => {
    const onResize = () => setDims({ w: window.innerWidth, h: window.innerHeight });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("resize", onResize);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  function paint(extra: Stroke | null) {
    const canvas = canvasRef.current;
    const committed = committedRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !committed || !ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(committed, 0, 0);
    if (extra) {
      const dpr = canvas.width / dims.w;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintStroke(ctx, extra);
    }
  }

  // redraw the finished strokes whenever they (or the screen size) change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(dims.w * dpr);
    canvas.height = Math.round(dims.h * dpr);
    const committed = committedRef.current ?? document.createElement("canvas");
    committedRef.current = committed;
    committed.width = canvas.width;
    committed.height = canvas.height;
    const ctx = committed.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    strokes.forEach((s) => paintStroke(ctx, s));
    paint(current.current?.stroke ?? null);
    // paint only reads refs and the current dims
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, dims]);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (current.current) return; // one finger draws; others are ignored
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // synthetic events
    }
    const stroke: Stroke = { brush, color, size, points: [{ x: e.clientX, y: e.clientY }] };
    current.current = { stroke, pointerId: e.pointerId };
    paint(stroke);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = current.current;
    if (!c || c.pointerId !== e.pointerId) return;
    const last = c.stroke.points[c.stroke.points.length - 1];
    if (Math.hypot(e.clientX - last.x, e.clientY - last.y) < 1.5) return;
    c.stroke.points.push({ x: e.clientX, y: e.clientY });
    paint(c.stroke);
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = current.current;
    if (!c || c.pointerId !== e.pointerId) return;
    current.current = null;
    setStrokes((prev) => [...prev, c.stroke]);
  }

  async function send() {
    if (strokes.length === 0 || sending) return;
    setSending(true);
    setError(null);
    // render at full resolution, then keep only the drawn pixels
    const dpr = window.devicePixelRatio || 1;
    const full = document.createElement("canvas");
    full.width = Math.round(dims.w * dpr);
    full.height = Math.round(dims.h * dpr);
    const ctx = full.getContext("2d", { willReadFrequently: true });
    if (!ctx) return setSending(false);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    strokes.forEach((s) => paintStroke(ctx, s));
    // the first and last rows with anything drawn on them
    const { data, width, height } = ctx.getImageData(0, 0, full.width, full.height);
    const drawnRow = (y: number) => {
      for (let x = 0; x < width; x++) if (data[(y * width + x) * 4 + 3] > 8) return true;
      return false;
    };
    let minY = 0;
    while (minY < height && !drawnRow(minY)) minY++;
    if (minY === height) {
      setSending(false);
      setError("Nothing to send: draw something first.");
      return;
    }
    let maxY = height - 1;
    while (maxY > minY && !drawnRow(maxY)) maxY--;
    const pad = Math.round(6 * dpr);
    const sy = Math.max(0, minY - pad);
    const sh = Math.min(height, maxY + pad + 1) - sy;
    const scale = Math.min(1, MAX_SIDE / Math.max(width, sh));
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(width * scale));
    out.height = Math.max(1, Math.round(sh * scale));
    out.getContext("2d")?.drawImage(full, 0, sy, width, sh, 0, 0, out.width, out.height);
    const display = { width: dims.w, height: sh / dpr };

    // WebP keeps the transparency and is small; Safari can only encode PNG
    let blob = await canvasToBlob(out, "image/webp");
    if (blob?.type !== "image/webp") blob = await canvasToBlob(out, "image/png");
    if (!blob) {
      setSending(false);
      setError("The drawing couldn't be made.");
      return;
    }
    try {
      await onSend(blob, display);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The drawing couldn't be sent.");
      setSending(false);
    }
  }

  const pill = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
      active ? "bg-white text-black" : "bg-neutral-800 text-neutral-200 hover:bg-neutral-700"
    }`;

  return (
    <div
      className="fixed inset-0 z-[60] select-none bg-black/60 backdrop-blur-[2px] [-webkit-touch-callout:none] [animation:fade-in_150ms_both]"
      role="dialog"
      aria-modal="true"
      aria-label="Draw"
    >
      <canvas
        ref={canvasRef}
        style={{ width: dims.w, height: dims.h }}
        className="absolute inset-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {strokes.length === 0 && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-sm font-medium text-white/70">
          Draw anywhere
        </p>
      )}

      {/* top bar: covers the page header, so nothing shows through the buttons */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-black via-black/90 to-transparent px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full bg-neutral-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700"
        >
          Cancel
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStrokes((prev) => prev.slice(0, -1))}
            disabled={strokes.length === 0}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-white transition hover:bg-neutral-700 disabled:opacity-40"
            aria-label="Undo"
            title="Undo"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setStrokes([])}
            disabled={strokes.length === 0}
            className="rounded-full bg-neutral-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-40"
          >
            Clear
          </button>
        </div>
        <button
          type="button"
          onClick={send}
          disabled={strokes.length === 0 || sending}
          className="rounded-full bg-violet-600 px-5 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-violet-500 disabled:bg-violet-600/50 disabled:text-white/60"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>

      {/* tools: one panel, above the page's message box */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {error && <p className="rounded-full bg-neutral-900 px-3 py-1 text-xs text-red-300">{error}</p>}
        <div className="pointer-events-auto flex w-full max-w-md flex-col gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/95 p-3 shadow-2xl">
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1.5">
              {(["pen", "neon", "eraser"] as const).map((b) => (
                <button key={b} type="button" onClick={() => setBrush(b)} aria-pressed={brush === b} className={pill(brush === b)}>
                  {b === "pen" ? "Pen" : b === "neon" ? "Neon" : "Eraser"}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              {SIZES.map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setSize(sz)}
                  aria-label={`Size ${sz}`}
                  aria-pressed={size === sz}
                  className={`flex h-8 w-8 items-center justify-center rounded-full transition ${
                    size === sz ? "bg-neutral-600" : "bg-neutral-800 hover:bg-neutral-700"
                  }`}
                >
                  <span className="rounded-full bg-white" style={{ width: sz + 2, height: sz + 2 }} />
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-between gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c);
                  if (brush === "eraser") setBrush("pen");
                }}
                aria-label={`Color ${c}`}
                aria-pressed={color === c && brush !== "eraser"}
                style={{ backgroundColor: c }}
                className={`h-7 w-7 flex-shrink-0 rounded-full ring-offset-2 ring-offset-neutral-950 transition ${
                  color === c && brush !== "eraser" ? "ring-2 ring-white" : "ring-1 ring-white/25"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
