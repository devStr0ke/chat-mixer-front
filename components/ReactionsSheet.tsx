"use client";

import type { Reaction } from "@/lib/api";
import { Avatar } from "./Avatar";
import { Sheet } from "./Sheet";

type Person = { id: string; pseudo: string; avatar_id: string | null };

/** Who reacted to a message; your own reaction can be removed from here. */
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
  // yours first, then in the order people reacted
  const rows = [...reactions].sort((a, b) => Number(b.user_id === currentUserId) - Number(a.user_id === currentUserId));

  return (
    <Sheet title="Reactions" onClose={onClose}>
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
    </Sheet>
  );
}
