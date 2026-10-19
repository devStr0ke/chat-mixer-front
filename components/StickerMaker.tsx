"use client";

import { useEffect, useRef, useState } from "react";

type Shape = "circle" | "square" | "cutout";
type Point = { x: number; y: number };
type View = { scale: number; x: number; y: number };

const OUTPUT = 512; // the sticker's longest side (px)
const BORDER = 14; // white sticker border (output px)
const MARGIN = 16; // around the circle/square in the work area (css px)
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 8;

const SHAPES: { id: Shape; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "square", label: "Square" },
  { id: "cutout", label: "Cut out" },
];

/** Adds the sticker's outline to the current canvas path. */
function traceShape(ctx: CanvasRenderingContext2D, shape: Shape, size: number, path: Point[]) {
  if (shape === "circle") {
    const r = size / 2 - MARGIN;
    ctx.moveTo(size / 2 + r, size / 2);
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  } else if (shape === "square") {
    const s = size - 2 * MARGIN;
    const r = s * 0.14;
    const x = MARGIN;
    const y = MARGIN;
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + s, y, x + s, y + s, r);
    ctx.arcTo(x + s, y + s, x, y + s, r);
    ctx.arcTo(x, y + s, x, y, r);
    ctx.arcTo(x, y, x + s, y, r);
    ctx.closePath();
  } else if (path.length > 2) {
    ctx.moveTo(path[0].x, path[0].y);
    for (const p of path.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.closePath();
  }
}

function shapeBounds(shape: Shape, size: number, path: Point[]) {
  if (shape !== "cutout") return { x: MARGIN, y: MARGIN, w: size - 2 * MARGIN, h: size - 2 * MARGIN };
  const xs = path.map((p) => p.x);
  const ys = path.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** The photo fills the work area at first (like a cover crop). */
function fitView(bitmap: ImageBitmap, size: number): View {
  const scale = size / Math.min(bitmap.width, bitmap.height);
  return { scale, x: (size - bitmap.width * scale) / 2, y: (size - bitmap.height * scale) / 2 };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.92));
}

/**
 * Makes a sticker out of a photo: move and zoom it, pick a circle, a rounded
 * square or a freehand cut-out (draw around what to keep), with an optional
 * white sticker border. Produces a transparent image of at most 512px.
 */
export function StickerMaker({
  file,
  onSave,
  onClose,
}: {
  file: File;
  onSave: (image: Blob) => Promise<void>;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null);
  const [error, setError] = useState<string | null>(null);
  // a first guess from the screen (top bar + controls ≈ 230px); the observer below refines it
  const [size, setSize] = useState(() => Math.max(160, Math.floor(Math.min(window.innerWidth - 24, window.innerHeight - 230))));
  const [shape, setShape] = useState<Shape>("circle");
  const [outline, setOutline] = useState(true);
  // set once moved; until then (and after a resize) the photo is fitted
  const [moved, setMoved] = useState<{ size: number; view: View } | null>(null);
  const [path, setPath] = useState<Point[]>([]);
  const [drawingNow, setDrawingNow] = useState(false);
  const [saving, setSaving] = useState(false);
  const pointers = useRef(new Map<number, Point>());
  const gesture = useRef<{ view: View; dist: number; mid: Point } | null>(null);
  // also a ref: pointer moves can arrive before the state update lands
  const drawing = useRef(false);

  const view = bitmap && size ? (moved?.size === size ? moved.view : fitView(bitmap, size)) : null;
  const fitScale = bitmap && size ? fitView(bitmap, size).scale : 1;
  const cutoutReady = path.length >= 8 && !drawingNow;
  const canSave = !!view && !saving && (shape !== "cutout" || cutoutReady);

  useEffect(() => {
    let cancelled = false;
    let decoded: ImageBitmap | null = null;
    createImageBitmap(file, { imageOrientation: "from-image" })
      .then((b) => {
        if (cancelled) return b.close();
        decoded = b;
        setBitmap(b);
      })
      .catch(() => !cancelled && setError("This photo can't be opened here. Try a JPEG or PNG."));
    return () => {
      cancelled = true;
      decoded?.close();
    };
  }, [file]);

  // the work area is the largest square that fits
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize(Math.floor(Math.min(width, height)));
    });
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // redraw the preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap || !view) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(bitmap, view.x, view.y, bitmap.width * view.scale, bitmap.height * view.scale);

    if (shape === "cutout" && drawingNow) {
      ctx.beginPath();
      path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
      return;
    }
    if (shape === "cutout" && path.length < 3) return;
    // dim what won't be part of the sticker
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    traceShape(ctx, shape, size, path);
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fill("evenodd");
    ctx.beginPath();
    traceShape(ctx, shape, size, path);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = outline ? 4 : 1.5;
    ctx.lineJoin = "round";
    ctx.stroke();
  }, [bitmap, view, size, shape, path, outline, drawingNow]);

  function local(e: React.PointerEvent): Point {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  /** Zooms around the middle of the work area (the slider). */
  function zoomTo(target: number) {
    if (!view) return;
    const scale = Math.min(fitScale * MAX_ZOOM, Math.max(fitScale * MIN_ZOOM, target));
    const k = scale / view.scale;
    const c = size / 2;
    setMoved({ size, view: { scale, x: c - (c - view.x) * k, y: c - (c - view.y) * k } });
  }

  function startGesture() {
    if (!view) return;
    const pts = [...pointers.current.values()];
    const mid = { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length };
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    gesture.current = { view, dist, mid };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    try {
      // keep receiving the drag even if the finger leaves the canvas
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // not an active pointer (synthetic events): drawing still works
    }
    pointers.current.set(e.pointerId, local(e));
    // one finger draws in cut-out mode; two fingers always move and zoom
    if (shape === "cutout" && pointers.current.size === 1) {
      gesture.current = null;
      drawing.current = true;
      setDrawingNow(true);
      setPath([local(e)]);
      return;
    }
    drawing.current = false;
    setDrawingNow(false);
    startGesture();
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const p = local(e);
    pointers.current.set(e.pointerId, p);
    if (drawing.current) {
      setPath((prev) => {
        const last = prev[prev.length - 1];
        return !last || Math.hypot(p.x - last.x, p.y - last.y) > 3 ? [...prev, p] : prev;
      });
      return;
    }
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];
    const mid = { x: pts.reduce((a, q) => a + q.x, 0) / pts.length, y: pts.reduce((a, q) => a + q.y, 0) / pts.length };
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
    const raw = g.dist && dist ? (g.view.scale * dist) / g.dist : g.view.scale;
    const scale = Math.min(fitScale * MAX_ZOOM, Math.max(fitScale * MIN_ZOOM, raw));
    const k = scale / g.view.scale;
    // zoom around where the fingers started, then follow them
    setMoved({ size, view: { scale, x: mid.x - (g.mid.x - g.view.x) * k, y: mid.y - (g.mid.y - g.view.y) * k } });
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    if (drawing.current) {
      drawing.current = false;
      setDrawingNow(false);
      return;
    }
    if (pointers.current.size > 0) startGesture();
    else gesture.current = null;
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    if (!view) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const at = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const scale = Math.min(fitScale * MAX_ZOOM, Math.max(fitScale * MIN_ZOOM, view.scale * Math.exp(-e.deltaY * 0.0015)));
    const k = scale / view.scale;
    setMoved({ size, view: { scale, x: at.x - (at.x - view.x) * k, y: at.y - (at.y - view.y) * k } });
  }

  async function save() {
    if (!bitmap || !view || !canSave) return;
    setSaving(true);
    const b = shapeBounds(shape, size, path);
    const pad = outline ? BORDER + 2 : 2;
    const k = (OUTPUT - 2 * pad) / Math.max(b.w, b.h, 1);
    const out = document.createElement("canvas");
    out.width = Math.round(b.w * k + 2 * pad);
    out.height = Math.round(b.h * k + 2 * pad);
    const ctx = out.getContext("2d");
    if (!ctx) return setSaving(false);
    // draw in work-area coordinates, scaled up to the sticker's size
    ctx.translate(pad - b.x * k, pad - b.y * k);
    ctx.scale(k, k);
    if (outline) {
      ctx.beginPath();
      traceShape(ctx, shape, size, path);
      ctx.fillStyle = "#fff";
      ctx.fill();
      ctx.lineWidth = (2 * BORDER) / k;
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#fff";
      ctx.stroke();
    }
    ctx.save();
    ctx.beginPath();
    traceShape(ctx, shape, size, path);
    ctx.clip();
    ctx.drawImage(bitmap, view.x, view.y, bitmap.width * view.scale, bitmap.height * view.scale);
    ctx.restore();

    // WebP keeps the transparency and is small; Safari can only encode PNG
    let blob = await canvasToBlob(out, "image/webp");
    if (blob?.type !== "image/webp") blob = await canvasToBlob(out, "image/png");
    if (!blob) {
      setSaving(false);
      setError("The sticker couldn't be made.");
      return;
    }
    try {
      await onSave(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sticker couldn't be saved.");
      setSaving(false);
    }
  }

  const hint =
    shape === "cutout"
      ? cutoutReady
        ? "Draw again to redo it · two fingers move and zoom"
        : "Draw around what you want to keep"
      : "Drag to move · pinch or scroll to zoom";

  return (
    <div
      data-composer-panel
      className="fixed inset-0 z-[60] flex flex-col bg-black text-white select-none [-webkit-touch-callout:none] [animation:fade-in_150ms_both]"
      role="dialog"
      aria-modal="true"
      aria-label="New sticker"
    >
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <button type="button" onClick={onClose} className="py-1.5 pr-3 text-[15px] text-neutral-300 hover:text-white">
          Cancel
        </button>
        <h2 className="text-[15px] font-semibold">New sticker</h2>
        <button
          type="button"
          onClick={save}
          disabled={!canSave}
          className="rounded-full bg-violet-600 px-4 py-1.5 text-[15px] font-semibold transition hover:bg-violet-500 disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      <div ref={boxRef} className="flex min-h-0 flex-1 items-center justify-center px-3">
        {error ? (
          <p className="px-6 text-center text-sm text-neutral-300">{error}</p>
        ) : (
          <canvas
            ref={canvasRef}
            style={{ width: size, height: size }}
            className="touch-none rounded-2xl bg-[repeating-conic-gradient(#262626_0%_25%,#171717_0%_50%)] [background-size:24px_24px]"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          />
        )}
      </div>

      <div className="flex flex-col items-center gap-3 px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <p className="text-xs text-neutral-400">{hint}</p>
        <div className="grid w-full max-w-sm grid-cols-3 rounded-xl bg-neutral-900 p-1 text-sm font-semibold" role="radiogroup" aria-label="Shape">
          {SHAPES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={shape === s.id}
              onClick={() => {
                setShape(s.id);
                setPath([]);
              }}
              className={`rounded-lg py-2 transition ${shape === s.id ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex w-full max-w-sm items-center gap-3">
          <svg className="h-4 w-4 flex-shrink-0 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <circle cx="11" cy="11" r="6" strokeWidth={2} />
            <path strokeLinecap="round" strokeWidth={2} d="M20 20l-4.5-4.5M8.5 11h5M11 8.5v5" />
          </svg>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            value={view ? view.scale / fitScale : 1}
            onChange={(e) => zoomTo(fitScale * Number(e.target.value))}
            aria-label="Zoom"
            className="flex-1 accent-violet-500"
          />
          <button
            type="button"
            onClick={() => setOutline((o) => !o)}
            aria-pressed={outline}
            className={`flex-shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${
              outline ? "border-white bg-white text-black" : "border-neutral-600 text-neutral-300"
            }`}
          >
            Border
          </button>
        </div>
      </div>
    </div>
  );
}
