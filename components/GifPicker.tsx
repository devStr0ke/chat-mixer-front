"use client";

import { useEffect, useState } from "react";
import { searchGifs, trendingGifs, type Gif } from "@/lib/api";

// starter GIPHY keys allow 100 calls per hour, so don't search on every keystroke
const SEARCH_DEBOUNCE = 450;

/** Searchable GIF library (GIPHY, through our API). Shows trending GIFs until a search is typed. */
export function GifPicker({ onSelect, autoFocusSearch = false }: { onSelect: (gif: Gif) => void; autoFocusSearch?: boolean }) {
  const [query, setQuery] = useState("");
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
          const page = q ? await searchGifs(q) : await trendingGifs();
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
  }, [q]);

  async function loadMore() {
    if (nextOffset === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = q ? await searchGifs(q, nextOffset) : await trendingGifs(nextOffset);
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

  return (
    <div className="flex h-[380px] w-[302px] max-w-full flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl">
      <input
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setStatus("loading");
        }}
        placeholder="Search GIFs…"
        autoFocus={autoFocusSearch}
        className="mx-2 mt-2 appearance-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500"
      />

      <div className="relative mt-2 flex-1 overflow-y-auto px-2" style={{ scrollBehavior: "auto" }}>
        {status === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
          </div>
        )}
        {status === "error" && (
          <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-neutral-500">
            {error}
          </p>
        )}
        {status === "ready" && gifs.length === 0 && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">No GIFs found.</p>
        )}
        {status === "ready" && gifs.length > 0 && (
          <>
            <p className="pb-1.5 text-xs font-medium text-neutral-500">{q ? "Results" : "Trending"}</p>
            <div className="columns-2 gap-1.5">
              {gifs.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  onClick={() => onSelect(gif)}
                  title={gif.title}
                  style={{ aspectRatio: `${gif.preview_width} / ${gif.preview_height}` }}
                  className="mb-1.5 block w-full break-inside-avoid overflow-hidden rounded-lg bg-neutral-800 transition hover:ring-2 hover:ring-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- animated GIFs from GIPHY's CDN */}
                  <img
                    src={gif.preview_url}
                    alt={gif.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    draggable={false}
                    className="h-full w-full object-cover"
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
                {loadingMore ? "Loading…" : "More GIFs"}
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
