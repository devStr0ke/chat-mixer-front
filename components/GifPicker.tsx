"use client";

import { useEffect, useState } from "react";
import {
  deleteSticker,
  listMyStickers,
  searchGifs,
  stickerImageUrl,
  trendingGifs,
  type Gif,
  type GifKind,
  type MessageSticker,
} from "@/lib/api";

// starter GIPHY keys allow 100 calls per hour, so don't search on every keystroke
const SEARCH_DEBOUNCE = 450;

/**
 * Searchable GIF and sticker library (GIPHY, through our API), plus your own
 * stickers. Shows what's trending until a search is typed.
 */
export function GifPicker({
  onSelect,
  onSelectSticker,
  onCreateSticker,
  stickersVersion = 0,
  autoFocusSearch = false,
  initialKind = "gifs",
  initialQuery = "",
}: {
  onSelect: (gif: Gif) => void;
  onSelectSticker: (sticker: MessageSticker) => void;
  /** opens the photo picker for a new sticker (called from the tap itself) */
  onCreateSticker: () => void;
  /** bumped when a sticker was added, to reload "My stickers" */
  stickersVersion?: number;
  autoFocusSearch?: boolean;
  /** the tab and search to open on (the composer's search button) */
  initialKind?: GifKind;
  initialQuery?: string;
}) {
  const [kind, setKind] = useState<GifKind>(initialKind);
  const [mine, setMine] = useState<MessageSticker[] | null>(null);
  const [editingMine, setEditingMine] = useState(false);
  const [query, setQuery] = useState(initialQuery);
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);

  const q = query.trim();

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(
      async () => {
        try {
          const page = q ? await searchGifs(q, 0, kind) : await trendingGifs(0, kind);
          if (cancelled) return;
          setGifs(page.gifs);
          setNextOffset(page.next_offset);
          setStatus("ready");
        } catch (err) {
          if (cancelled) return;
          setError(err instanceof Error ? err.message : "GIF search failed.");
          setStatus("error");
        }
      },
      q ? SEARCH_DEBOUNCE : 0
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, kind]);

  useEffect(() => {
    if (kind !== "stickers") return;
    let cancelled = false;
    listMyStickers()
      .then((list) => !cancelled && setMine(list))
      .catch(() => !cancelled && setMine([]));
    return () => {
      cancelled = true;
    };
  }, [kind, stickersVersion]);

  async function removeMine(sticker: MessageSticker) {
    setMine((prev) => prev?.filter((s) => s.id !== sticker.id) ?? null);
    try {
      await deleteSticker(sticker.id);
    } catch {
      setMine((prev) => (prev ? [sticker, ...prev] : prev));
    }
  }

  async function loadMore() {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = q ? await searchGifs(q, nextOffset, kind) : await trendingGifs(nextOffset, kind);
      setGifs((prev) => {
        const known = new Set(prev.map((g) => g.id));
        return [...prev, ...page.gifs.filter((g) => !known.has(g.id))];
      });
      setNextOffset(page.next_offset);
    } catch (err) {
      setError(err instanceof Error ? err.message : "GIF search failed.");
      setStatus("error");
    } finally {
      setLoadingMore(false);
    }
  }

  const stickers = kind === "stickers";
  const noun = stickers ? "stickers" : "GIFs";

  return (
    <div className="flex h-[380px] w-[302px] max-w-full flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl">
      <div className="mx-2 mt-2 grid grid-cols-2 rounded-lg bg-neutral-800 p-0.5 text-xs font-semibold" role="tablist">
        {(["gifs", "stickers"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={kind === k}
            onClick={() => {
              if (k === kind) return;
              setKind(k);
              setGifs([]);
              setNextOffset(null);
              setStatus("loading");
            }}
            className={`rounded-md py-1.5 transition ${kind === k ? "bg-neutral-700 text-white" : "text-neutral-400 hover:text-neutral-200"}`}
          >
            {k === "gifs" ? "GIFs" : "Stickers"}
          </button>
        ))}
      </div>
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setStatus("loading");
        }}
        placeholder={`Search ${noun}…`}
        autoFocus={autoFocusSearch}
        className="mx-2 mt-2 appearance-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500"
      />

      <div className="relative mt-2 flex-1 overflow-y-auto px-2" style={{ scrollBehavior: "auto" }}>
        {stickers && !q && (
          <div className="pb-3">
            <div className="flex items-center justify-between pb-1.5">
              <p className="text-xs font-medium text-neutral-500">My stickers</p>
              {!!mine?.length && (
                <button
                  type="button"
                  onClick={() => setEditingMine((e) => !e)}
                  className="text-xs font-medium text-violet-400 hover:text-violet-300"
                >
                  {editingMine ? "Done" : "Edit"}
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={onCreateSticker}
                className="flex aspect-square flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-neutral-600 text-[10px] font-medium text-neutral-400 transition hover:border-neutral-400 hover:text-white"
                aria-label="Create a sticker from a photo"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeWidth={2} d="M12 5v14M5 12h14" />
                </svg>
                Create
              </button>
              {mine?.map((s) => (
                <div key={s.id} className="relative">
                  <button
                    type="button"
                    onClick={() => (editingMine ? removeMine(s) : onSelectSticker(s))}
                    className={`block aspect-square w-full rounded-lg bg-neutral-800/40 p-1 transition hover:ring-2 hover:ring-violet-500 ${
                      editingMine ? "animate-pulse" : ""
                    }`}
                    aria-label={editingMine ? "Remove this sticker" : "Send this sticker"}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- your own sticker (authenticated, same-origin) */}
                    <img src={stickerImageUrl(s.id)} alt="" draggable={false} className="h-full w-full object-contain" />
                  </button>
                  {editingMine && (
                    <span className="pointer-events-none absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs leading-none text-white">
                      ×
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
        {status === "loading" && (
          <div className="flex justify-center py-10">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        )}
        {status === "error" && <p className="px-6 py-10 text-center text-sm text-neutral-500">{error}</p>}
        {status === "ready" && gifs.length === 0 && (
          <p className="py-10 text-center text-sm text-neutral-500">No {noun} found.</p>
        )}
        {status === "ready" && gifs.length > 0 && (
          <>
            <p className="pb-1.5 text-xs font-medium text-neutral-500">{q ? "Results" : stickers ? "Trending on GIPHY" : "Trending"}</p>
            <div className="columns-2 gap-1.5">
              {gifs.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  onClick={() => onSelect(gif)}
                  title={gif.title}
                  style={{ aspectRatio: `${gif.preview_width} / ${gif.preview_height}` }}
                  className={`mb-1.5 block w-full break-inside-avoid overflow-hidden rounded-lg transition hover:ring-2 hover:ring-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                    stickers ? "bg-neutral-800/40 p-1" : "bg-neutral-800"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- animated GIFs from GIPHY's CDN */}
                  <img
                    src={gif.preview_url}
                    alt={gif.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    draggable={false}
                    className={`h-full w-full ${stickers ? "object-contain" : "object-cover"}`}
                  />
                </button>
              ))}
            </div>
            {nextOffset !== null && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="mb-2 w-full rounded-lg py-2 text-xs text-neutral-400 transition hover:bg-neutral-800 hover:text-neutral-200 disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : `More ${noun}`}
              </button>
            )}
          </>
        )}
      </div>

      <p className="border-t border-neutral-800 px-3 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
        Powered by GIPHY
      </p>
    </div>
  );
}
