import type { CSSProperties } from "react";
import { roomBackgroundUrl, type RoomTheme, type RoomThemeColors } from "./api";

export const DEFAULT_COLORS = {
  background: "#0a0a0a",
  bubbleOwn: "#7c3aed",
  bubbleOther: "#262626",
};

export const THEME_PRESETS: { name: string; colors: RoomThemeColors }[] = [
  { name: "Default", colors: { background_color: null, bubble_own_color: null, bubble_other_color: null } },
  { name: "Ocean", colors: { background_color: "#0b1f33", bubble_own_color: "#0284c7", bubble_other_color: "#16324f" } },
  { name: "Forest", colors: { background_color: "#0d1f17", bubble_own_color: "#16a34a", bubble_other_color: "#1c3527" } },
  { name: "Sunset", colors: { background_color: "#2a1215", bubble_own_color: "#ea580c", bubble_other_color: "#43201f" } },
  { name: "Midnight", colors: { background_color: "#020617", bubble_own_color: "#6366f1", bubble_other_color: "#1e293b" } },
  { name: "Rose", colors: { background_color: "#fdf2f8", bubble_own_color: "#db2777", bubble_other_color: "#ffffff" } },
  { name: "Paper", colors: { background_color: "#f5f5f4", bubble_own_color: "#2563eb", bubble_other_color: "#ffffff" } },
];

/** WCAG relative luminance of a #rrggbb color (0 = black, 1 = white). */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** White or near-black, whichever reads better on the given color. */
export function readableTextOn(hex: string): string {
  return luminance(hex) > 0.25 ? "#171717" : "#ffffff";
}

export interface ResolvedTheme {
  /** background of the conversation area */
  container: CSSProperties;
  ownBubble: CSSProperties;
  otherBubble: CSSProperties;
  /** true when labels drawn straight on the background need dark text */
  onLight: boolean;
  /** color for labels drawn straight on the background (names, dates, "seen by") */
  muted: string;
}

export function resolveTheme(roomId: string, theme: RoomTheme): ResolvedTheme {
  const background = theme.background_color ?? DEFAULT_COLORS.background;
  const own = theme.bubble_own_color ?? DEFAULT_COLORS.bubbleOwn;
  const other = theme.bubble_other_color ?? DEFAULT_COLORS.bubbleOther;

  // an image gets a dark veil so labels stay readable whatever the picture is
  const hasImage = !!theme.background_image_id;
  const onLight = !hasImage && luminance(background) > 0.4;

  return {
    container: hasImage
      ? {
          backgroundColor: background,
          backgroundImage: `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url("${roomBackgroundUrl(roomId, theme.background_image_id!)}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }
      : { backgroundColor: background },
    ownBubble: { backgroundColor: own, color: readableTextOn(own) },
    otherBubble: { backgroundColor: other, color: readableTextOn(other) },
    onLight,
    muted: onLight ? "rgba(23,23,23,0.62)" : "rgba(245,245,245,0.55)",
  };
}
