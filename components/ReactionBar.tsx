"use client";

export const QUICK_REACTIONS = ["❤️", "😂", "😮", "😢", "😡", "👍"];

/** One-tap reactions plus "+" for the full emoji picker; the current one is highlighted. */
export function ReactionBar({
  selected,
  onPick,
  onMore,
  compact = false,
  animated = false,
}: {
  selected?: string;
  onPick: (emoji: string) => void;
  onMore: () => void;
  compact?: boolean;
  /** emojis pop in one after another (the long-press menu) */
  animated?: boolean;
}) {
  const button = `leading-none flex items-center justify-center rounded-full transition hover:scale-125 active:scale-110 ${
    compact ? "text-xl w-9 h-9 hover:bg-neutral-800" : "text-[28px] w-11 h-11"
  }`;
  // a reaction picked from the full picker isn't one of the shortcuts
  const custom = selected && !QUICK_REACTIONS.includes(selected) ? selected : null;
  const pop = (i: number) => (animated ? { animation: `pop-in 240ms ${i * 28}ms both` } : undefined);

  return (
    <div
      className={`flex items-center bg-neutral-900 border border-neutral-700/80 rounded-full shadow-2xl ${
        compact ? "gap-0.5 px-1.5 py-1" : "gap-0.5 px-1.5 py-1"
      }`}
    >
      {QUICK_REACTIONS.map((emoji, i) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          style={pop(i)}
          className={`${button} ${selected === emoji ? "bg-white/15" : ""}`}
          aria-label={`React ${emoji}`}
        >
          {emoji}
        </button>
      ))}
      {custom && (
        <button
          type="button"
          onClick={() => onPick(custom)}
          style={pop(QUICK_REACTIONS.length)}
          className={`${button} bg-white/15`}
          aria-label={`React ${custom}`}
        >
          {custom}
        </button>
      )}
      <button
        type="button"
        onClick={onMore}
        style={pop(QUICK_REACTIONS.length + 1)}
        className={`${button} text-neutral-300 hover:text-white ${compact ? "" : "bg-neutral-800 !w-9 !h-9 ml-0.5"}`}
        aria-label="More emojis"
        title="More emojis"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}
