"use client";

import { useEffect, useState } from "react";
import { attachmentSrc, type DisplayAttachment } from "./AttachmentGrid";

/** Full-screen viewer for a message's images. Arrow keys navigate, Escape closes. */
export function Lightbox({
  attachments,
  index,
  onClose,
}: {
  attachments: DisplayAttachment[];
  index: number;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(index);
  const count = attachments.length;
  const attachment = attachments[current];

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setCurrent((c) => (c - 1 + count) % count);
      if (e.key === "ArrowRight") setCurrent((c) => (c + 1) % count);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [count, onClose]);

  const navButton =
    "absolute top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center rounded-full bg-neutral-900/80 text-neutral-200 hover:bg-neutral-800 transition";

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-4 py-3 text-sm text-neutral-300">
        <span className="tabular-nums">{count > 1 ? `${current + 1} / ${count}` : ""}</span>
        <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
          <a
            href={attachmentSrc(attachment)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-neutral-400 hover:text-white transition"
          >
            Open original
          </a>
          <button onClick={onClose} className="text-neutral-400 hover:text-white transition" aria-label="Close">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin images */}
      <img
        src={attachmentSrc(attachment)}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-w-[92vw] max-h-[85vh] object-contain rounded-lg shadow-2xl"
      />

      {count > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCurrent((c) => (c - 1 + count) % count);
            }}
            className={`${navButton} left-3`}
            aria-label="Previous image"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCurrent((c) => (c + 1) % count);
            }}
            className={`${navButton} right-3`}
            aria-label="Next image"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}
    </div>
  );
}
