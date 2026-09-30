"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import { getLinkPreview, linkPreviewImageUrl, type LinkPreview } from "@/lib/api";

/**
 * Card for a link in a message: site, title, description and image. Renders
 * nothing until (and unless) the page turns out to have a preview.
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

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="mt-2 block w-64 max-w-full overflow-hidden rounded-xl bg-black/15 text-left transition hover:bg-black/25"
    >
      {banner && (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin images
        <img
          src={linkPreviewImageUrl(preview.image_id!)}
          alt=""
          loading="lazy"
          draggable={false}
          className="aspect-[1.91/1] w-full object-cover"
        />
      )}
      <span className="flex items-start gap-2.5 px-3 py-2">
        {!banner && preview.image_id && (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin images
          <img
            src={linkPreviewImageUrl(preview.image_id)}
            alt=""
            loading="lazy"
            draggable={false}
            className="mt-0.5 h-10 w-10 flex-shrink-0 rounded-lg object-cover"
          />
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
