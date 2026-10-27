import { create } from "zustand";

/**
 * YouTube, TikTok and Instagram videos play inside the app, in the sites' own
 * embedded players, instead of sending people off to the site or app.
 */

export type EmbedProvider = "YouTube" | "TikTok" | "Instagram";

export type Embed = {
  provider: EmbedProvider;
  /** the player's address */
  src: string;
  /** wide: 16:9 video; tall: 9:16 (Shorts, TikTok); post: Instagram's embed (header, video, footer) */
  shape: "wide" | "tall" | "post";
};

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const TIKTOK_ID = /^\d{8,25}$/;
const INSTAGRAM_CODE = /^[A-Za-z0-9_-]{5,64}$/;

function parse(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/** "example.com", "www.example.com" and "m.example.com" alike. */
function isHost(u: URL, ...hosts: string[]): boolean {
  const host = u.hostname.toLowerCase();
  return hosts.some((h) => host === h || host === `www.${h}` || host === `m.${h}`);
}

/** "90", "90s", "1m30s", "1h2m3s" → seconds. */
function seconds(t: string | null): number {
  if (!t) return 0;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

function youtube(u: URL): Embed | null {
  let id: string | null = null;
  let tall = false;
  if (isHost(u, "youtu.be")) {
    id = u.pathname.split("/")[1] ?? null;
  } else if (isHost(u, "youtube.com", "music.youtube.com", "youtube-nocookie.com")) {
    const [, first, second] = u.pathname.split("/");
    if (first === "watch") id = u.searchParams.get("v");
    else if (first === "shorts") [id, tall] = [second, true];
    else if (first === "embed" || first === "live" || first === "v") id = second;
  }
  if (!id || !YOUTUBE_ID.test(id)) return null;
  const start = seconds(u.searchParams.get("t") ?? u.searchParams.get("start"));
  const params = new URLSearchParams({ autoplay: "1", playsinline: "1", rel: "0" });
  if (start) params.set("start", String(start));
  return {
    provider: "YouTube",
    // the privacy-enhanced player: no YouTube cookies until the video plays
    src: `https://www.youtube-nocookie.com/embed/${id}?${params}`,
    shape: tall ? "tall" : "wide",
  };
}

function tiktok(u: URL): Embed | null {
  if (!isHost(u, "tiktok.com")) return null;
  // /@someone/video/123, /@someone/photo/123, /v/123.html, /embed/v2/123, /player/v1/123
  const id = u.pathname
    .split("/")
    .map((part) => part.replace(/\.html$/, ""))
    .reverse()
    .find((part) => TIKTOK_ID.test(part));
  if (!id) return null;
  // TikTok's player fails ("Player error") when it may not start muted; the sound is one tap away
  const params = new URLSearchParams({ autoplay: "1", muted: "1", loop: "1", rel: "0", description: "1", music_info: "1" });
  return { provider: "TikTok", src: `https://www.tiktok.com/player/v1/${id}?${params}`, shape: "tall" };
}

function instagram(u: URL): Embed | null {
  if (!isHost(u, "instagram.com", "instagr.am")) return null;
  let path = u.pathname;
  // logged-out redirects carry the post in ?next=
  if (path.startsWith("/accounts/login")) path = u.searchParams.get("next") ?? "";
  // /reel/CODE, /reels/CODE, /p/CODE, /tv/CODE, also /someone/reel/CODE
  const parts = path.split("/").filter(Boolean);
  // /share/reel/… codes aren't the post's: those links are looked up by the server
  if (parts[0] === "share") return null;
  const at = parts.findIndex((p) => p === "reel" || p === "reels" || p === "p" || p === "tv");
  const code = at >= 0 ? parts[at + 1] : undefined;
  if (!code || !INSTAGRAM_CODE.test(code)) return null;
  const kind = parts[at] === "p" ? "p" : "reel";
  return { provider: "Instagram", src: `https://www.instagram.com/${kind}/${code}/embed/`, shape: "post" };
}

/** The in-app player for a link, when it's a YouTube, TikTok or Instagram video or post. */
export function embedFor(raw: string): Embed | null {
  const u = parse(raw);
  return u ? (youtube(u) ?? tiktok(u) ?? instagram(u)) : null;
}

/** Short share links (vm.tiktok.com/…, instagram.com/share/…): the server finds the video behind them. */
export function isShortVideoLink(raw: string): boolean {
  const u = parse(raw);
  if (!u) return false;
  const host = u.hostname.toLowerCase();
  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") return true;
  if (isHost(u, "tiktok.com")) return u.pathname.startsWith("/t/");
  if (isHost(u, "instagram.com")) return u.pathname.startsWith("/share/");
  return false;
}

/** Whether tapping this link opens the in-app player. */
export function playsInApp(raw: string): boolean {
  return !!embedFor(raw) || isShortVideoLink(raw);
}

export function providerOf(raw: string): EmbedProvider | null {
  const u = parse(raw);
  if (!u) return null;
  if (isHost(u, "youtube.com", "youtu.be", "music.youtube.com", "youtube-nocookie.com")) return "YouTube";
  if (isHost(u, "tiktok.com") || /^v[mt]\.tiktok\.com$/i.test(u.hostname)) return "TikTok";
  if (isHost(u, "instagram.com", "instagr.am")) return "Instagram";
  return null;
}

/** The link being played, if any (one player for the whole app). */
export const useEmbedPlayer = create<{ url: string | null; open: (url: string) => void; close: () => void }>()(
  (set) => ({
    url: null,
    open: (url) => set({ url }),
    close: () => set({ url: null }),
  })
);

/**
 * Click handler for a link: plays it in the app when it can, otherwise lets
 * the browser open it. A modified click (new tab, etc.) is left alone.
 */
export function playLinkInApp(e: React.MouseEvent, url: string) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  if (!playsInApp(url)) return;
  e.preventDefault();
  useEmbedPlayer.getState().open(url);
}
