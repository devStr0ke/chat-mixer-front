"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Snapchat-style text and drawings on a photo or video from the camera.
 * Everything is stored relative to the picture (0..1), so the same drawing
 * code renders it on screen and, at full size, into the file that's sent.
 */

export const SNAP_COLORS = ["#ffffff", "#111111", "#ef4444", "#f97316", "#facc15", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"];

export type SnapStroke = { color: string; points: number[] };
export type SnapCaption = { text: string; style: "bar" | "big"; color: string; x: number; y: number };
export type SnapEdits = { strokes: SnapStroke[]; caption: SnapCaption | null };
export type Box = { x: number; y: number; w: number; h: number };

export const NO_EDITS: SnapEdits = { strokes: [], caption: null };

export const hasEdits = (e: SnapEdits) => e.strokes.length > 0 || !!e.caption?.text.trim();

const FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
const MAX_CAPTION = 120;
/** finger movement under this (CSS px) is a tap, not a drag */
const TAP_SLOP = 6;

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Caption sizes, from the picture's shorter side: identical on screen and in the file. */
function captionMetrics(style: SnapCaption["style"], w: number, h: number) {
  const unit = Math.min(w, h);
  return style === "bar"
    ? { size: unit * 0.05, weight: 500, lineHeight: 1.3 }
    : { size: unit * 0.1, weight: 800, lineHeight: 1.15 };
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    const joined = line ? `${line} ${word}` : word;
    if (!line || ctx.measureText(joined).width <= maxWidth) {
      line = joined;
    } else {
      lines.push(line);
      line = word;
    }
    // a word wider than the picture is broken up
    let chars = [...line];
    while (chars.length > 1 && ctx.measureText(line).width > maxWidth) {
      let cut = chars.length - 1;
      while (cut > 1 && ctx.measureText(chars.slice(0, cut).join("")).width > maxWidth) cut--;
      lines.push(chars.slice(0, cut).join(""));
      chars = chars.slice(cut);
      line = chars.join("");
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draws the caption and returns where it is (in the canvas's units). */
function drawCaption(ctx: CanvasRenderingContext2D, c: SnapCaption, w: number, h: number): Box {
  const { size, weight, lineHeight } = captionMetrics(c.style, w, h);
  ctx.save();
  ctx.font = `${weight} ${size}px ${FAMILY}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const lines = wrapLines(ctx, c.text, w * 0.9);
  const step = size * lineHeight;
  let box: Box;
  if (c.style === "bar") {
    const height = lines.length * step + size * 0.9;
    box = { x: 0, y: clamp(c.y * h - height / 2, 0, h - height), w, h: height };
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(box.x, box.y, box.w, box.h);
  } else {
    const pad = size * 0.25;
    const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + pad * 2;
    const height = lines.length * step + pad * 2;
    box = {
      x: clamp(c.x * w - width / 2, 0, Math.max(0, w - width)),
      y: clamp(c.y * h - height / 2, 0, Math.max(0, h - height)),
      w: width,
      h: height,
    };
    ctx.lineJoin = "round";
    ctx.lineWidth = size * 0.12;
    ctx.strokeStyle = c.color === "#111111" ? "rgba(255, 255, 255, 0.7)" : "rgba(0, 0, 0, 0.45)";
  }
  const top = box.y + (box.h - lines.length * step) / 2;
  const cx = box.x + box.w / 2;
  lines.forEach((line, i) => {
    const y = top + step * (i + 0.5);
    if (c.style === "big") ctx.strokeText(line, cx, y);
    ctx.fillStyle = c.color;
    ctx.fillText(line, cx, y);
  });
  ctx.restore();
  return box;
}

function drawStroke(ctx: CanvasRenderingContext2D, s: SnapStroke, w: number, h: number) {
  const p = s.points;
  if (p.length < 2) return;
  const width = Math.min(w, h) * 0.016;
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  if (p.length === 2) {
    ctx.arc(p[0] * w, p[1] * h, width / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // smoothed through the midpoints, like DrawPad
    ctx.moveTo(p[0] * w, p[1] * h);
    for (let i = 2; i < p.length - 2; i += 2) {
      ctx.quadraticCurveTo(p[i] * w, p[i + 1] * h, ((p[i] + p[i + 2]) / 2) * w, ((p[i + 1] + p[i + 3]) / 2) * h);
    }
    ctx.lineTo(p[p.length - 2] * w, p[p.length - 1] * h);
    ctx.stroke();
  }
  ctx.restore();
}

/** Draws the edits onto a w × h picture; returns the caption's box, if drawn. */
export function renderEdits(
  ctx: CanvasRenderingContext2D,
  edits: SnapEdits,
  w: number,
  h: number,
  { caption = true, extra }: { caption?: boolean; extra?: SnapStroke | null } = {}
): Box | null {
  for (const s of edits.strokes) drawStroke(ctx, s, w, h);
  if (extra) drawStroke(ctx, extra, w, h);
  return caption && edits.caption?.text.trim() ? drawCaption(ctx, edits.caption, w, h) : null;
}

/** The edits alone, on a transparent w × h canvas (laid over a video). */
export function editsCanvas(edits: SnapEdits, w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx) renderEdits(ctx, edits, w, h);
  return canvas;
}

type Gesture =
  | { kind: "draw"; pointerId: number; stroke: SnapStroke; lastX: number; lastY: number }
  | { kind: "drag"; pointerId: number; startX: number; startY: number; x: number; y: number; moved: boolean }
  | { kind: "tap"; pointerId: number; startX: number; startY: number };

const toolButton = (active: boolean) =>
  `flex h-11 w-11 items-center justify-center rounded-full backdrop-blur-sm transition active:scale-90 ${
    active ? "bg-white text-black" : "bg-black/35 text-white"
  }`;

// a tap on a tool keeps the keyboard up while typing a caption
const keepFocus = (e: React.SyntheticEvent) => e.preventDefault();

/**
 * The editing layer, laid exactly over the picture (box). Tap the picture to
 * write (the caption can then be dragged), pick the pen to draw.
 */
export function SnapEditor({
  box,
  edits,
  onChange,
  onEditingChange,
}: {
  box: Box;
  edits: SnapEdits;
  onChange: (edits: SnapEdits) => void;
  onEditingChange: (editing: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const captionBoxRef = useRef<Box | null>(null);
  const frameRef = useRef(0);
  const [pen, setPen] = useState(false);
  const [color, setColor] = useState(SNAP_COLORS[0]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // the latest edits, for a paint scheduled from a pointer handler
  const editsRef = useRef(edits);
  useLayoutEffect(() => {
    editsRef.current = edits;
  });

  const paint = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const pw = Math.round(box.w * dpr);
    const ph = Math.round(box.h * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.w, box.h);
    const g = gestureRef.current;
    captionBoxRef.current = renderEdits(ctx, editsRef.current, box.w, box.h, {
      caption: !editing,
      extra: g?.kind === "draw" ? g.stroke : null,
    });
  };

  // repainted after every render: the edits, the box or the editing state changed
  useLayoutEffect(paint);

  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  useEffect(() => {
    onEditingChange(editing);
  }, [editing, onEditingChange]);

  // the caption's own size (at least 16px, or phones zoom into the field)
  const metrics = captionMetrics(edits.caption?.style ?? "bar", box.w, box.h);
  useLayoutEffect(() => {
    inputRef.current?.style.setProperty("font-size", `${Math.max(16, metrics.size)}px`, "important");
  }, [metrics.size]);

  function schedulePaint() {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(paint);
  }

  function startEditing(at?: { x: number; y: number }) {
    const c = edits.caption;
    if (!c) {
      onChange({
        ...edits,
        caption: { text: "", style: "bar", color: SNAP_COLORS[0], x: at?.x ?? 0.5, y: at?.y ?? 0.5 },
      });
    }
    setDraft(c?.text ?? "");
    setPen(false);
    setEditing(true);
    // focused right in the tap: phones only open the keyboard for that
    inputRef.current?.focus({ preventScroll: true });
  }

  function finishEditing() {
    if (!editing) return;
    setEditing(false);
    const c = editsRef.current.caption;
    const text = draft.trim();
    onChange({ ...editsRef.current, caption: c && text ? { ...c, text } : null });
  }

  function handleText() {
    if (!editing) {
      startEditing();
      return;
    }
    // while typing, the T switches between the bar and big text
    const c = edits.caption;
    if (c) onChange({ ...edits, caption: { ...c, style: c.style === "bar" ? "big" : "bar" } });
  }

  function pickColor(next: string) {
    setColor(next);
    const c = edits.caption;
    if (editing && c) onChange({ ...edits, caption: { ...c, color: next } });
  }

  function local(e: React.PointerEvent) {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (gestureRef.current || e.button !== 0) return;
    if (editing) {
      // a tap beside the text puts it down
      inputRef.current?.blur();
      finishEditing();
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* moves are still caught while over the picture */
    }
    const p = local(e);
    if (pen) {
      gestureRef.current = {
        kind: "draw",
        pointerId: e.pointerId,
        stroke: { color, points: [p.x / box.w, p.y / box.h] },
        lastX: p.x,
        lastY: p.y,
      };
      schedulePaint();
      return;
    }
    const cb = captionBoxRef.current;
    const c = edits.caption;
    if (c && cb && p.x >= cb.x && p.x <= cb.x + cb.w && p.y >= cb.y && p.y <= cb.y + cb.h) {
      gestureRef.current = { kind: "drag", pointerId: e.pointerId, startX: p.x, startY: p.y, x: c.x, y: c.y, moved: false };
      return;
    }
    gestureRef.current = { kind: "tap", pointerId: e.pointerId, startX: p.x, startY: p.y };
  }

  function handleMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    const p = local(e);
    if (g.kind === "draw") {
      if (Math.hypot(p.x - g.lastX, p.y - g.lastY) < 1.5) return;
      g.lastX = p.x;
      g.lastY = p.y;
      g.stroke.points.push(clamp(p.x / box.w, 0, 1), clamp(p.y / box.h, 0, 1));
      schedulePaint();
    } else if (g.kind === "drag") {
      const dx = p.x - g.startX;
      const dy = p.y - g.startY;
      if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
      g.moved = true;
      const c = edits.caption;
      if (!c) return;
      onChange({
        ...edits,
        caption: {
          ...c,
          // the bar spans the picture: it only moves up and down
          x: c.style === "bar" ? c.x : clamp(g.x + dx / box.w, 0, 1),
          y: clamp(g.y + dy / box.h, 0, 1),
        },
      });
    }
  }

  function handleUp(e: React.PointerEvent<HTMLCanvasElement>, cancelled = false) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gestureRef.current = null;
    if (g.kind === "draw") {
      onChange({ ...edits, strokes: [...edits.strokes, g.stroke] });
      return;
    }
    if (cancelled) return;
    if (g.kind === "drag") {
      if (!g.moved) startEditing();
      return;
    }
    const p = local(e);
    if (Math.hypot(p.x - g.startX, p.y - g.startY) < TAP_SLOP) {
      startEditing({ x: p.x / box.w, y: p.y / box.h });
    }
  }

  const caption = edits.caption;
  const style = caption?.style ?? "bar";
  const textColor = caption?.color ?? SNAP_COLORS[0];

  return (
    <>
      <canvas
        ref={canvasRef}
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={(e) => handleUp(e)}
        onPointerCancel={(e) => handleUp(e, true)}
        className={`absolute touch-none ${pen ? "cursor-crosshair" : "cursor-text"}`}
        style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
        aria-label={pen ? "Draw on it" : "Tap to write on it"}
      />

      {/* always there (invisible until a tap starts a caption) so it can take the focus at once */}
      <div
        className={`absolute flex justify-center ${
          editing ? (style === "bar" ? "bg-black/55" : "") : "pointer-events-none opacity-0"
        }`}
        style={{
          left: box.x,
          width: box.w,
          // above the keyboard on every phone
          top: "32%",
          paddingTop: style === "bar" ? metrics.size * 0.45 : 0,
          paddingBottom: style === "bar" ? metrics.size * 0.45 : 0,
        }}
        aria-hidden={!editing}
      >
        <input
          ref={inputRef}
          value={draft}
          maxLength={MAX_CAPTION}
          tabIndex={editing ? 0 : -1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              inputRef.current?.blur();
            }
          }}
          onBlur={finishEditing}
          enterKeyHint="done"
          autoComplete="off"
          className="w-[90%] bg-transparent text-center outline-none"
          style={{
            color: textColor,
            fontFamily: FAMILY,
            fontWeight: metrics.weight,
            lineHeight: metrics.lineHeight,
            caretColor: textColor === "#111111" ? "#111111" : "#ffffff",
            textShadow:
              style === "big"
                ? `0 0 ${metrics.size * 0.08}px rgba(0, 0, 0, ${textColor === "#111111" ? 0 : 0.6})`
                : undefined,
          }}
          aria-label="Text"
        />
      </div>

      <div className="absolute right-4 top-[calc(max(1rem,env(safe-area-inset-top))+3.75rem)] flex flex-col items-center gap-3">
        <button
          type="button"
          onPointerDown={keepFocus}
          onMouseDown={keepFocus}
          onClick={handleText}
          className={toolButton(editing)}
          aria-label={editing ? "Switch text style" : "Add text"}
          title={editing ? "Switch text style" : "Add text"}
        >
          <span className="text-[19px] font-extrabold leading-none">T</span>
        </button>
        <button
          type="button"
          onClick={() => {
            finishEditing();
            setPen((p) => !p);
          }}
          className={toolButton(pen)}
          aria-label="Draw"
          aria-pressed={pen}
          title="Draw"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.2 5.2l3.6 3.6M4 20l4.2-1 10.4-10.4a2.5 2.5 0 00-3.6-3.6L4.6 15.4 4 20z" />
          </svg>
        </button>
        {edits.strokes.length > 0 && !editing && (
          <button
            type="button"
            onClick={() => onChange({ ...edits, strokes: edits.strokes.slice(0, -1) })}
            className={toolButton(false)}
            aria-label="Undo"
            title="Undo"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 010 11H11" />
            </svg>
          </button>
        )}
        {(pen || editing) && (
          <div className="mt-1 flex flex-col items-center gap-2 rounded-full bg-black/35 p-1.5 backdrop-blur-sm">
            {SNAP_COLORS.map((c) => {
              const active = editing ? textColor === c : color === c;
              return (
                <button
                  key={c}
                  type="button"
                  onPointerDown={keepFocus}
                  onMouseDown={keepFocus}
                  onClick={() => pickColor(c)}
                  className={`h-6 w-6 rounded-full border-2 transition ${active ? "scale-125 border-white" : "border-white/40"}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                  aria-pressed={active}
                />
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
