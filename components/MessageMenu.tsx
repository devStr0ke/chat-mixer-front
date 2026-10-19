"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ReactionBar } from "./ReactionBar";

export type MessageAction = {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  /** destructive (shown in red) */
  danger?: boolean;
};

const MARGIN = 12;
const GAP = 10;
const BAR_HEIGHT = 54;
const ACTION_HEIGHT = 46;
const HEADER_HEIGHT = 34;
const MENU_WIDTH = 230;

/** Where the lifted message, the reactions and the menu go so all three fit on screen. */
function place(rect: DOMRect, actions: number) {
  const vh = window.innerHeight;
  const menuHeight = HEADER_HEIGHT + actions * ACTION_HEIGHT;
  const room = vh - 2 * MARGIN - BAR_HEIGHT - menuHeight - 2 * GAP;
  const height = Math.min(rect.height, Math.max(room, 96));
  const minTop = MARGIN + BAR_HEIGHT + GAP;
  const maxTop = vh - MARGIN - menuHeight - GAP - height;
  const top = Math.max(minTop, Math.min(rect.top, maxTop));
  return { top, height, clipped: height < rect.height };
}

/**
 * Instagram-style long-press menu: the rest of the screen blurs, the message
 * lifts where it is (moved only as much as needed for everything to fit),
 * reactions sit above it and actions below.
 */
export function MessageMenu({
  bubble,
  isOwn,
  timeLabel,
  selected,
  actions,
  onReact,
  onMoreReactions,
  onClose,
}: {
  /** the pressed bubble: a copy of it is shown lifted */
  bubble: HTMLElement;
  isOwn: boolean;
  timeLabel: string;
  /** your current reaction */
  selected?: string;
  actions: MessageAction[];
  onReact: (emoji: string) => void;
  onMoreReactions: () => void;
  onClose: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [rect] = useState(() => bubble.getBoundingClientRect());
  const [spot] = useState(() => place(rect, actions.length));
  const [lifted, setLifted] = useState(false);

  // a visual copy: the real bubble stays in the list, under the blur
  useLayoutEffect(() => {
    const copy = bubble.cloneNode(true) as HTMLElement;
    copy.removeAttribute("data-bubble");
    copy.style.width = `${rect.width}px`;
    copy.style.margin = "0";
    host.current?.replaceChildren(copy);

    // the reactions are wider than most messages: keep them inside the screen
    if (bar.current) {
      const vw = window.innerWidth;
      const start = Math.max(MARGIN, isOwn ? vw - rect.right : rect.left); // from the aligned edge
      const overflow = Math.max(0, start + bar.current.offsetWidth - (vw - MARGIN));
      bar.current.style.translate = `${isOwn ? overflow : -overflow}px 0`;
    }
  }, [bubble, rect, isOwn]);

  useEffect(() => {
    const t = setTimeout(() => setLifted(true), 16);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const vw = window.innerWidth;
  // reactions and menu line up with the message's side, kept on screen
  const side: React.CSSProperties = isOwn
    ? { right: Math.max(MARGIN, vw - rect.right) }
    : { left: Math.max(MARGIN, rect.left) };
  const origin = isOwn ? "right" : "left";

  return (
    <div
      className="fixed inset-0 z-50 select-none [-webkit-touch-callout:none]"
      onClick={onClose}
      onContextMenu={(e) => e.preventDefault()}
      role="dialog"
      aria-modal="true"
      aria-label="Message actions"
    >
      <div className="absolute inset-0 bg-black/45 backdrop-blur-md [animation:fade-in_160ms_both]" />

      <div
        ref={bar}
        className="absolute"
        style={{ ...side, top: spot.top - GAP - BAR_HEIGHT }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ transformOrigin: `${origin} bottom`, animation: "menu-in 200ms both" }}>
          <ReactionBar selected={selected} onPick={onReact} onMore={onMoreReactions} animated />
        </div>
      </div>

      <div
        className="absolute pointer-events-none"
        style={{
          left: rect.left,
          top: spot.top,
          height: spot.height,
          overflow: spot.clipped ? "hidden" : undefined,
          maskImage: spot.clipped ? "linear-gradient(to bottom, black 80%, transparent)" : undefined,
          transform: lifted ? "translateY(0) scale(1.03)" : `translateY(${rect.top - spot.top}px)`,
          transformOrigin: origin,
          transition: "transform 240ms cubic-bezier(0.2, 0.9, 0.3, 1.15)",
          filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.45))",
        }}
      >
        <div ref={host} />
      </div>

      <div
        className="absolute overflow-hidden rounded-2xl bg-neutral-900/95 border border-neutral-700/70 shadow-2xl"
        style={{
          ...side,
          top: spot.top + spot.height + GAP,
          width: MENU_WIDTH,
          maxWidth: `calc(100vw - ${2 * MARGIN}px)`,
          transformOrigin: `${origin} top`,
          animation: "menu-in 200ms 40ms both",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="px-4 pt-2.5 pb-1.5 text-[11px] text-neutral-500" style={{ height: HEADER_HEIGHT }}>
          {timeLabel}
        </p>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.onSelect}
            className={`flex w-full items-center justify-between border-t border-neutral-800 px-4 text-[15px] active:bg-neutral-800 hover:bg-neutral-800/70 ${
              a.danger ? "text-red-400" : "text-neutral-100"
            }`}
            style={{ height: ACTION_HEIGHT }}
          >
            {a.label}
            <span className={a.danger ? "text-red-400" : "text-neutral-300"}>{a.icon}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
