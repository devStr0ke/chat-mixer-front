"use client";

import type { PendingUpload } from "@/lib/useAttachmentUploads";
import { PlayIcon } from "./AttachmentGrid";

/** Thumbnails of the photos and videos waiting in the composer. */
export function PendingUploads({
  uploads,
  onRemove,
}: {
  uploads: PendingUpload[];
  onRemove: (key: string) => void;
}) {
  if (uploads.length === 0) return null;

  return (
    <ul className="flex gap-2 overflow-x-auto px-4 pt-3">
      {uploads.map((u) => {
        const thumb = u.kind === "video" ? u.posterUrl : u.previewUrl;
        const percent = Math.round((u.progress ?? 0) * 100);
        // once everything is sent, the server still has to store it
        const sending = u.kind === "video" && u.progress !== undefined && u.progress < 1;
        return (
          <li key={u.key} className="relative flex-shrink-0" title={u.error}>
            <div
              className={`relative w-16 h-16 rounded-lg overflow-hidden border bg-neutral-800 ${
                u.status === "error" ? "border-red-500 opacity-60" : "border-neutral-700"
              }`}
            >
              {thumb && (
                // eslint-disable-next-line @next/next/no-img-element -- local blob preview
                <img src={thumb} alt="" className="w-full h-full object-cover" />
              )}
              {u.kind === "video" && u.status !== "uploading" && (
                <span className="absolute inset-0 flex items-center justify-center">
                  <PlayIcon className="w-6 h-6" />
                </span>
              )}
              {u.status === "uploading" && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                  {sending ? (
                    <span className="text-[11px] font-semibold text-white tabular-nums">{percent}%</span>
                  ) : (
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                </span>
              )}
              {u.status === "uploading" && u.kind === "video" && (
                <span className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
                  <span className="block h-full bg-violet-400 transition-[width]" style={{ width: `${percent}%` }} />
                </span>
              )}
              {u.status === "error" && (
                <span className="absolute inset-x-0 bottom-0 bg-red-600/90 text-[9px] font-medium text-white text-center py-0.5">
                  Failed
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onRemove(u.key)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-neutral-700 hover:bg-neutral-600 text-white text-xs leading-none border border-neutral-900"
              aria-label={u.kind === "video" ? "Remove video" : "Remove image"}
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
