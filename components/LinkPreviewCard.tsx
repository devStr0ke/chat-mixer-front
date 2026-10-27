"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { getLinkPreview, linkPreviewImageUrl, type LinkPreview } from "@/lib/api";
import { playLinkInApp, playsInApp } from "@/lib/embeds";

function PlayBadge({ small = false }: { small?: boolean }) {
  return (
    <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <span
        className={`flex items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm ${
          small ? "h-6 w-6" : "h-12 w-12"
        }`}
      >
        <svg className={small ? "ml-0.5 h-3 w-3" : "ml-1 h-6 w-6"} fill="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path d="M8 5.5v13a1 1 0 001.5.86l11-6.5a1 1 0 000-1.72l-11-6.5A1 1 0 008 5.5z" />
        </svg>
      </span>
    </span>
  );
}

/**
 * Card for a link in a message: site, title, description and image. Renders
 * nothing until (and unless) the page turns out to have a preview. YouTube,
 * TikTok and Instagram videos get a play button and play in the app.
 * `onShown` lets the conversation re-pin its scroll once the card takes space.
 */
export function LinkPreviewCard({ url, onShown }: { url: string; onShown?: () => void }) {
  const [loaded, setLoaded] = useState<{ url: string; preview: LinkPreview | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLinkPreview(url).then((preview) => {
      if (!cancelled) setLoaded({ url, preview });
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // a card loaded for a previous URL (message edited) must not be shown for the new one
  const preview = loaded?.url === url ? loaded.preview : null;

  useLayoutEffect(() => {
    if (preview) onShown?.();
  }, [preview, onShown]);

  if (!preview) return null;

  // wide pictures become a banner; icons and avatars sit beside the text
  const banner = preview.image_id !== null && preview.image_width >= 300 && preview.image_width >= preview.image_height * 1.2;
  const video = playsInApp(url);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      onClick={(e) => playLinkInApp(e, url)}
      className="mt-2 block w-64 max-w-full overflow-hidden rounded-xl bg-black/15 text-left transition hover:bg-black/25"
    >
      {banner && (
        <span className="relative block">
          {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin images */}
          <img
            src={linkPreviewImageUrl(preview.image_id!)}
            alt=""
            loading="lazy"
            draggable={false}
            className="aspect-[1.91/1] w-full object-cover"
          />
          {video && <PlayBadge />}
        </span>
      )}
      <span className="flex items-start gap-2.5 px-3 py-2">
        {!banner && preview.image_id && (
          <span className="relative mt-0.5 flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin images */}
            <img
              src={linkPreviewImageUrl(preview.image_id)}
              alt=""
              loading="lazy"
              draggable={false}
              className="h-10 w-10 rounded-lg object-cover"
            />
            {video && <PlayBadge small />}
          </span>
        )}
        {/* Instagram hides its pictures from link previews: a video still shows it plays */}
        {video && !preview.image_id && (
          <span className="relative mt-0.5 h-10 w-10 flex-shrink-0 rounded-lg bg-black/25">
            <PlayBadge small />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-semibold uppercase tracking-wide opacity-70">
            {preview.site_name}
          </span>
          <span className="break-words text-[13px] font-medium leading-snug line-clamp-2">{preview.title}</span>
          {preview.description && (
            <span className="mt-0.5 break-words text-xs leading-snug opacity-75 line-clamp-2">
              {preview.description}
            </span>
          )}
        </span>
      </span>
    </a>
  );
}
