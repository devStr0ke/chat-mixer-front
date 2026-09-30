"use client";

import { useEffect, useState } from "react";
import { getMessageEdits, type MessageVersion } from "@/lib/api";
import { formatDay, formatTime } from "@/lib/format";

/** Every version of an edited message, newest first. Open to all room members. */
export function EditHistoryDialog({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const [versions, setVersions] = useState<MessageVersion[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMessageEdits(messageId)
      .then((res) => {
        if (!cancelled) setVersions(res.versions);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load the edit history.");
      });
    return () => {
      cancelled = true;
    };
  }, [messageId]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const count = versions?.length ?? 0;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <h2 className="text-base font-semibold text-white">Edit history</h2>
          <button onClick={onClose} className="p-1 text-neutral-500 transition hover:text-neutral-300" aria-label="Close">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && <p className="text-sm text-red-400">{error}</p>}
          {!error && !versions && (
            <div className="flex justify-center py-6">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          )}
          {versions && (
            <ol className="space-y-4">
              {[...versions].reverse().map((version, i) => {
                const label = i === 0 ? "Current version" : i === count - 1 ? "Original" : "Earlier version";
                return (
                  <li key={`${version.at}-${i}`} className="space-y-1.5">
                    <p className="flex items-center justify-between gap-2 text-xs">
                      <span className={i === 0 ? "font-medium text-violet-300" : "font-medium text-neutral-400"}>
                        {label}
                      </span>
                      <span className="text-neutral-500">
                        {formatDay(version.at)} · {formatTime(version.at)}
                      </span>
                    </p>
                    <p className="whitespace-pre-wrap break-words rounded-xl bg-neutral-800 px-3 py-2 text-sm text-neutral-100">
                      {version.content || <span className="italic text-neutral-500">(no text)</span>}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
