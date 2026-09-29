"use client";

import type { PendingUpload } from "@/lib/useAttachmentUploads";

/** Thumbnails of the images waiting in the composer. */
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
      {uploads.map((u) => (
        <li key={u.key} className="relative flex-shrink-0" title={u.error}>
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
          <img
            src={u.previewUrl}
            alt=""
            className={`w-16 h-16 rounded-lg object-cover border ${
              u.status === "error" ? "border-red-500 opacity-60" : "border-neutral-700"
            }`}
          />
          {u.status === "uploading" && (
            <span className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50">
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </span>
          )}
          {u.status === "error" && (
            <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-red-600/90 text-[9px] font-medium text-white text-center py-0.5">
              Failed
            </span>
          )}
          <button
            type="button"
            onClick={() => onRemove(u.key)}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 flex items-center justify-center rounded-full bg-neutral-700 hover:bg-neutral-600 text-white text-xs leading-none border border-neutral-900"
            aria-label="Remove image"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
