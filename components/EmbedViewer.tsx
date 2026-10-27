"use client";

import { useEffect, useState } from "react";
import { resolveVideoLink } from "@/lib/api";
import { type Embed, embedFor, isShortVideoLink, providerOf, useEmbedPlayer } from "@/lib/embeds";

// sized to fit the screen, leaving room for the bars above and below
const FRAME_SIZE: Record<Embed["shape"], React.CSSProperties> = {
  wide: { width: "min(100vw - 1.5rem, (100dvh - 9rem) * 16 / 9, 64rem)", aspectRatio: "16 / 9" },
  tall: { height: "min(100dvh - 9rem, (100vw - 1.5rem) * 16 / 9)", aspectRatio: "9 / 16" },
  post: { width: "min(100vw - 1.5rem, 25rem)", height: "min(100dvh - 9rem, 46rem)" },
};

/**
 * Plays a YouTube, TikTok or Instagram link inside the app, in the site's own
 * player, over whatever page is open. Nothing is loaded from those sites until
 * a link is tapped, and closing it stops the video.
 */
export function EmbedViewer() {
  const url = useEmbedPlayer((s) => s.url);
  const close = useEmbedPlayer((s) => s.close);
  const [resolved, setResolved] = useState<{ url: string; embed: Embed | null } | null>(null);
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);

  const direct = url ? embedFor(url) : null;
  const short = !!url && !direct && isShortVideoLink(url);

  // short share links are looked up first (vm.tiktok.com/… → the video's address)
  useEffect(() => {
    if (!url || !short) return;
    let cancelled = false;
    resolveVideoLink(url).then((full) => {
      if (!cancelled) setResolved({ url, embed: full ? embedFor(full) : null });
    });
    return () => {
      cancelled = true;
    };
  }, [url, short]);

  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [url, close]);

  if (!url) return null;

  // undefined: still looking the link up; null: it isn't a video the player can show
  const embed = direct ?? (short ? (resolved?.url === url ? resolved.embed : undefined) : null);
  const provider = embed?.provider ?? providerOf(url) ?? "the site";

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/90 backdrop-blur-sm select-none [animation:fade-in_150ms_both]"
      onClick={(e) => e.target === e.currentTarget && close()}
      role="dialog"
      aria-modal="true"
      aria-label={`${provider} video`}
    >
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <span className="text-sm font-semibold text-white/90">{provider}</span>
        <button
          type="button"
          onClick={close}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-90"
          aria-label="Close"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center px-3"
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        {embed ? (
          <div
            className={`relative overflow-hidden rounded-xl ${embed.shape === "post" ? "bg-white" : "bg-black"}`}
            style={FRAME_SIZE[embed.shape]}
          >
            {loadedSrc !== embed.src && (
              <span className="absolute inset-0 flex items-center justify-center bg-neutral-900">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
              </span>
            )}
            <iframe
              key={embed.src}
              src={embed.src}
              title={`${embed.provider} video`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              onLoad={() => setLoadedSrc(embed.src)}
              className="h-full w-full border-0"
            />
          </div>
        ) : embed === undefined ? (
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/80 border-t-transparent" />
        ) : (
          <p className="max-w-xs text-center text-sm text-neutral-300">This link can&apos;t be played here.</p>
        )}
      </div>

      <div className="flex justify-center px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/20"
        >
          Open in {provider}
        </a>
      </div>
    </div>
  );
}
