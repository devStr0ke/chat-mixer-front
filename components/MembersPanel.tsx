"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getRoomInvitations,
  inviteToRoom,
  deleteInvitation,
  type Invitation,
  type Member,
  type RoomDetail,
} from "@/lib/api";
import { Avatar } from "./Avatar";
import { UserFlags } from "./UserFlags";
import { UserPicker } from "./UserPicker";

/**
 * Slide-over listing a room's members and pending invitations.
 * `refreshKey` changes whenever the room reports membership/invitation changes.
 */
export function MembersPanel({
  room,
  currentUserId,
  refreshKey,
  onClose,
  onRemove,
  onLeave,
}: {
  room: RoomDetail;
  currentUserId: string;
  refreshKey: number;
  onClose: () => void;
  onRemove: (member: Member) => void;
  onLeave: () => void;
}) {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  const isOwner = room.owner_id === currentUserId;

  const fetchInvitations = useCallback(async () => {
    try {
      setInvitations(await getRoomInvitations(room.id));
    } catch {
      /* the room view handles losing access */
    }
  }, [room.id]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations, refreshKey]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleInvite(pseudo: string) {
    setError(null);
    setInviting(true);
    try {
      const invitation = await inviteToRoom(room.id, pseudo);
      setInvitations((prev) => [invitation, ...prev.filter((i) => i.id !== invitation.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite.");
    } finally {
      setInviting(false);
    }
  }

  async function handleCancel(invitation: Invitation) {
    setInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
    try {
      await deleteInvitation(invitation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel invitation.");
      fetchInvitations();
    }
  }

  const excludeIds = [
    ...room.members.map((m) => m.id),
    ...invitations.map((i) => i.invitee.id),
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm h-full bg-neutral-900 border-l border-neutral-800 flex flex-col shadow-2xl"
      >
        <header className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <h2 className="text-base font-semibold text-white">
            Members <span className="text-neutral-500 font-normal">({room.members.length})</span>
          </h2>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-300 transition p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          <section className="space-y-2">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Invite someone</p>
            <UserPicker
              onSelect={(u) => handleInvite(u.pseudo)}
              excludeIds={excludeIds}
              disabled={inviting}
            />
            {error && <p className="text-xs text-red-400">{error}</p>}
          </section>

          {invitations.length > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">
                Pending invitations
              </p>
              <ul className="space-y-1">
                {invitations.map((inv) => {
                  const canCancel = isOwner || inv.inviter.id === currentUserId;
                  return (
                    <li key={inv.id} className="flex items-center gap-3 py-1.5">
                      <Avatar user={inv.invitee} size={28} className="opacity-60" />
                      <div className="flex-1 min-w-0">
                        <p className="flex items-center gap-1.5 text-sm text-neutral-300">
                          <span className="truncate">{inv.invitee.pseudo}</span>
                          <UserFlags country={inv.invitee.country} country2={inv.invitee.country2} width={16} />
                        </p>
                        <p className="text-[11px] text-neutral-500 truncate">
                          invited by {inv.inviter.id === currentUserId ? "you" : inv.inviter.pseudo}
                        </p>
                      </div>
                      {canCancel && (
                        <button
                          onClick={() => handleCancel(inv)}
                          className="text-xs text-neutral-500 hover:text-red-400 transition"
                        >
                          Cancel
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">In this room</p>
            <ul className="space-y-1">
              {room.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-1.5">
                  <Avatar user={m} size={28} />
                  <p className="flex-1 min-w-0 flex items-center gap-1.5 text-sm text-neutral-200">
                    <span className="truncate">
                      {m.pseudo}
                      {m.id === currentUserId && <span className="text-neutral-500"> (you)</span>}
                    </span>
                    <UserFlags country={m.country} country2={m.country2} width={16} />
                  </p>
                  {m.id === room.owner_id && (
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-300 bg-violet-600/20 border border-violet-500/30 rounded-full px-2 py-0.5">
                      Owner
                    </span>
                  )}
                  {isOwner && m.id !== currentUserId && (
                    <button
                      onClick={() => onRemove(m)}
                      className="text-xs text-neutral-500 hover:text-red-400 transition"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="px-5 py-4 border-t border-neutral-800">
          <button
            onClick={onLeave}
            className="w-full py-2.5 text-sm font-medium text-red-400 border border-red-900/60 hover:bg-red-900/20 rounded-lg transition"
          >
            Leave room
          </button>
        </footer>
      </aside>
    </div>
  );
}
