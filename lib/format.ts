const DAY_MS = 86_400_000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/** "Today", "Yesterday", or a date — used for day separators in a conversation. */
export function formatDay(iso: string): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY_MS);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: diff < 7 ? "long" : undefined,
    day: "numeric",
    month: "long",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/** Compact timestamp for room lists: time today, weekday this week, date otherwise. */
export function formatShort(iso: string): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY_MS);
  if (diff === 0) return formatTime(iso);
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

/**
 * Timestamp shown between messages after a pause, as Instagram does: the time
 * today, then "Yesterday 14:05", "Mon 14:05", "12 Oct, 14:05".
 */
export function formatStamp(iso: string): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY_MS);
  const time = formatTime(iso);
  if (diff === 0) return time;
  if (diff === 1) return `Yesterday ${time}`;
  if (diff < 7) return `${d.toLocaleDateString([], { weekday: "short" })} ${time}`;
  const date = d.toLocaleDateString([], {
    day: "numeric",
    month: "short",
    year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
  return `${date}, ${time}`;
}

/** "Today at 14:05", "Monday 12 October at 14:05" */
export function formatFull(iso: string): string {
  return `${formatDay(iso)} at ${formatTime(iso)}`;
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|[#*0-9]\uFE0F?\u20E3|\u200D|\uFE0F|\s)+$/u;

/** True for messages of just one to three emojis, shown large without a bubble. */
export function isBigEmoji(text: string): boolean {
  if (!text || text.length > 48 || !EMOJI_ONLY.test(text)) return false;
  const graphemes = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text.replace(/\s/g, ""))];
  return graphemes.length >= 1 && graphemes.length <= 3;
}

export function sameDay(a: string, b: string): boolean {
  return startOfDay(new Date(a)) === startOfDay(new Date(b));
}

const NAME_COLORS = [
  "text-sky-300",
  "text-emerald-300",
  "text-amber-300",
  "text-rose-300",
  "text-cyan-300",
  "text-fuchsia-300",
  "text-lime-300",
  "text-orange-300",
];

// same hues, dark enough to read on a light room background
const NAME_COLORS_ON_LIGHT = [
  "text-sky-700",
  "text-emerald-700",
  "text-amber-700",
  "text-rose-700",
  "text-cyan-700",
  "text-fuchsia-700",
  "text-lime-700",
  "text-orange-700",
];

/** Stable per-user color for sender names in group conversations. */
export function nameColor(userId: string, onLight = false): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) | 0;
  const palette = onLight ? NAME_COLORS_ON_LIGHT : NAME_COLORS;
  return palette[Math.abs(h) % palette.length];
}
