"use client";

import { useEffect } from "react";
import type { Reaction } from "@/lib/api";
import { Avatar } from "./Avatar";

type Person = { id: string; pseudo: string; avatar_id: string | null };

/** Who reacted to a message (a bottom sheet on phones); your own reaction can be removed from here. */
export function ReactionsSheet({
  reactions,
  currentUserId,
  personOf,
  onRemoveMine,
  onClose,
}: {
  reactions: Reaction[];
  currentUserId: string;
  personOf: (userId: string) => Person;
  onRemoveMine: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // yours first, then in the order people reacted
  const rows = [...reactions].sort((a, b) => Number(b.user_id === currentUserId) - Number(a.user_id === currentUserId));

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/50 [animation:fade-in_160ms_both]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Reactions"
    >
      <div
        className="w-full sm:w-[360px] max-h-[70dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-neutral-900 border border-neutral-800 pb-[max(1rem,env(safe-area-inset-bottom))] [animation:sheet-up_240ms_cubic-bezier(0.2,0.9,0.3,1)_both] sm:[animation:menu-in_200ms_both]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-neutral-900 pt-2.5 pb-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-neutral-700 sm:hidden" />
          <h2 className="mt-3 text-center text-[15px] font-semibold text-white">Reactions</h2>
        </div>
        <ul>
          {rows.map((r) => {
            const mine = r.user_id === currentUserId;
            const person = personOf(r.user_id);
            const content = (
              <>
                <Avatar user={person} size={40} />
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[15px] font-medium text-neutral-100">{mine ? "You" : person.pseudo}</span>
                  {mine && <span className="block text-xs text-neutral-500">Tap to remove</span>}
                </span>
                <span className="text-2xl leading-none">{r.emoji}</span>
              </>
            );
            return (
              <li key={r.user_id}>
                {mine ? (
                  <button
                    type="button"
                    onClick={onRemoveMine}
                    className="flex w-full items-center gap-3 px-5 py-2.5 active:bg-neutral-800 hover:bg-neutral-800/60"
                  >
                    {content}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-5 py-2.5">{content}</div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
