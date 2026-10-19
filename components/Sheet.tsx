"use client";

import { useEffect, type ReactNode } from "react";

/** A bottom sheet on phones (a centered card on wider screens), closed by the backdrop or Escape. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/50 [animation:fade-in_160ms_both]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="w-full sm:w-[360px] max-h-[70dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-neutral-900 border border-neutral-800 pb-[max(1rem,env(safe-area-inset-bottom))] [animation:sheet-up_240ms_cubic-bezier(0.2,0.9,0.3,1)_both] sm:[animation:menu-in_200ms_both]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-neutral-900 pt-2.5 pb-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-neutral-700 sm:hidden" />
          <h2 className="mt-3 text-center text-[15px] font-semibold text-white">{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}
