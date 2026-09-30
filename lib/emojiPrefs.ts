import type { SkinTone } from "frimousse";

const RECENT_KEY = "chatmixer:recent-emojis";
const SKIN_TONE_KEY = "chatmixer:emoji-skin-tone";
const MAX_RECENT = 16;

const SKIN_TONES: SkinTone[] = ["none", "light", "medium-light", "medium", "medium-dark", "dark"];

export function loadRecentEmojis(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((e) => typeof e === "string").slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/** Moves an emoji to the front of the recently used list and returns the new list. */
export function rememberEmoji(emoji: string): string[] {
  const next = [emoji, ...loadRecentEmojis().filter((e) => e !== emoji)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: recents just won't persist */
  }
  return next;
}

export function loadSkinTone(): SkinTone {
  try {
    const stored = localStorage.getItem(SKIN_TONE_KEY) as SkinTone | null;
    return stored && SKIN_TONES.includes(stored) ? stored : "none";
  } catch {
    return "none";
  }
}

export function saveSkinTone(skinTone: SkinTone) {
  try {
    localStorage.setItem(SKIN_TONE_KEY, skinTone);
  } catch {
    /* ignore */
  }
}
