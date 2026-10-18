"use client";

import { useLayoutEffect, useRef } from "react";

const HOLD_MS = 380;
const SLOP = 8; // movement (px) that turns a press into a drag
const LOCK = 10; // movement (px) after which the drag's direction is decided
const REPLY_AT = 56; // swipe distance (px) that triggers a reply
const REVEAL_AT = 52; // swipe distance (px) that fully shows the times
const DOUBLE_TAP_MS = 300;
const SETTLE_MS = 200;

type Mode = "pending" | "reply" | "reveal" | "scroll";

type Gesture = {
  pointerId: number;
  touch: boolean;
  x: number;
  y: number;
  // the message pressed, when the press started on a sent message's bubble
  id: string | null;
  bubble: HTMLElement | null;
  row: HTMLElement | null;
  mode: Mode;
  armed: boolean; // swiped far enough to reply on release
  held: boolean; // the long-press fired
  timer: ReturnType<typeof setTimeout> | null;
};

export type MessageGestureHandlers = {
  /** long-press on a message (touch) */
  onLongPress: (id: string, bubble: HTMLElement) => void;
  /** double-tap / double-click on a message */
  onDoubleTap: (id: string, bubble: HTMLElement) => void;
  /** message swiped right past the threshold */
  onSwipeReply: (id: string) => void;
  /** right-click on a message (mouse) */
  onRightClick: (id: string, bubble: HTMLElement) => void;
};

// past the limit the drag slows down, like a rubber band
function damp(d: number, limit: number, max: number) {
  return Math.min(max, d <= limit ? d : limit + (d - limit) * 0.25);
}

// a light haptic tick (Android; iPhones don't expose vibration to web pages)
function buzz(ms: number) {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  navigator.vibrate(ms);
}

function drag(el: Element | null | undefined, x: number) {
  if (!(el instanceof HTMLElement)) return;
  el.style.transition = "none";
  el.style.transform = x ? `translateX(${x}px)` : "";
}

// slides back to rest, then drops the inline styles (a transform left in
// place would make every row its own stacking context)
function settle(el: Element | null | undefined) {
  if (!(el instanceof HTMLElement) || !el.style.transform) return;
  el.style.transition = `transform ${SETTLE_MS}ms ease, opacity ${SETTLE_MS}ms ease`;
  el.style.transform = "translateX(0)";
  setTimeout(() => {
    el.style.transition = "";
    el.style.transform = "";
  }, SETTLE_MS);
}

/**
 * Instagram-style gestures for the message list, handled once for the whole
 * list (event delegation) rather than per message:
 * - long-press a message (touch) → its menu
 * - double-tap (or double-click) a message → ❤️
 * - swipe a message right → reply to it
 * - swipe the list left → every message's time slides in from the right
 *
 * The list must be `touch-action: pan-y pinch-zoom`, so vertical scrolling
 * and zooming stay with the browser and horizontal drags come here. Rows are
 * `[data-message-id]`, sent messages' bubbles `[data-bubble]`, the part of a
 * row that moves `[data-shift]`, the reply arrow `[data-reply-cue]`; the
 * element that slides left to show times is `revealRef`.
 */
export function useMessageGestures(
  revealRef: React.RefObject<HTMLElement | null>,
  handlers: MessageGestureHandlers
) {
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ id: string; time: number } | null>(null);
  const lastPointerTouch = useRef(false);
  const suppressClickUntil = useRef(0);
  const handlersRef = useRef(handlers);
  useLayoutEffect(() => {
    handlersRef.current = handlers;
  });

  function end(g: Gesture) {
    if (g.timer) clearTimeout(g.timer);
    settle(g.row?.querySelector("[data-shift]"));
    const cue = g.row?.querySelector("[data-reply-cue]");
    if (cue instanceof HTMLElement) cue.style.opacity = "0";
    settle(revealRef.current);
    gesture.current = null;
  }

  return {
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      lastPointerTouch.current = e.pointerType !== "mouse";
      if (e.button !== 0 || gesture.current) return;
      const target = e.target as Element;
      const bubble = target.closest<HTMLElement>("[data-bubble]");
      const row = bubble?.closest<HTMLElement>("[data-message-id]") ?? null;
      const id = bubble && row ? (row.dataset.messageId ?? null) : null;
      const g: Gesture = {
        pointerId: e.pointerId,
        touch: e.pointerType !== "mouse",
        x: e.clientX,
        y: e.clientY,
        id,
        bubble,
        row,
        mode: "pending",
        armed: false,
        held: false,
        timer: null,
      };
      if (g.touch && id && bubble) {
        g.timer = setTimeout(() => {
          g.timer = null;
          g.held = true;
          lastTap.current = null;
          suppressClickUntil.current = Date.now() + 800;
          buzz(10);
          handlersRef.current.onLongPress(id, bubble);
        }, HOLD_MS);
      }
      gesture.current = g;
    },

    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId || g.held) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (g.timer && Math.hypot(dx, dy) > SLOP) {
        clearTimeout(g.timer);
        g.timer = null;
      }
      if (!g.touch) return;

      if (g.mode === "pending") {
        if (Math.abs(dx) > LOCK && Math.abs(dx) > Math.abs(dy) * 1.4) {
          g.mode = dx < 0 ? "reveal" : g.id ? "reply" : "scroll";
        } else if (Math.abs(dy) > LOCK) {
          g.mode = "scroll";
        }
      }

      if (g.mode === "reply") {
        const d = damp(Math.max(0, dx), REPLY_AT, 96);
        drag(g.row?.querySelector("[data-shift]"), d);
        const cue = g.row?.querySelector("[data-reply-cue]");
        if (cue instanceof HTMLElement) {
          cue.style.transition = "none";
          cue.style.opacity = String(Math.min(1, d / REPLY_AT));
        }
        if (!g.armed && d >= REPLY_AT) {
          g.armed = true;
          buzz(8);
        } else if (g.armed && d < REPLY_AT) {
          g.armed = false;
        }
        suppressClickUntil.current = Date.now() + 400;
      } else if (g.mode === "reveal") {
        drag(revealRef.current, -damp(Math.max(0, -dx), REVEAL_AT, 72));
        suppressClickUntil.current = Date.now() + 400;
      }
    },

    onPointerUp(e: React.PointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (!g || e.pointerId !== g.pointerId) return;
      const tapped = g.mode === "pending" && !g.held && Math.hypot(e.clientX - g.x, e.clientY - g.y) <= SLOP;
      if (g.mode === "reply" && g.armed && g.id) handlersRef.current.onSwipeReply(g.id);
      end(g);

      if (tapped && g.id && g.bubble) {
        const now = Date.now();
        const last = lastTap.current;
        if (last?.id === g.id && now - last.time < DOUBLE_TAP_MS) {
          lastTap.current = null;
          handlersRef.current.onDoubleTap(g.id, g.bubble);
        } else {
          lastTap.current = { id: g.id, time: now };
        }
      }
    },

    // the browser took the touch over (it's a scroll)
    onPointerCancel(e: React.PointerEvent<HTMLElement>) {
      const g = gesture.current;
      if (g && e.pointerId === g.pointerId) end(g);
    },

    // no native menu (copy, share, open link…) on a touch long-press;
    // right-clicking a message opens the reaction picker instead
    onContextMenu(e: React.MouseEvent<HTMLElement>) {
      if (lastPointerTouch.current) {
        e.preventDefault();
        return;
      }
      const bubble = (e.target as Element).closest<HTMLElement>("[data-bubble]");
      const id = bubble?.closest<HTMLElement>("[data-message-id]")?.dataset.messageId;
      if (bubble && id) {
        e.preventDefault();
        handlersRef.current.onRightClick(id, bubble);
      }
    },

    // the click that follows a long-press or a swipe isn't a tap
    onClickCapture(e: React.MouseEvent<HTMLElement>) {
      if (Date.now() < suppressClickUntil.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}
