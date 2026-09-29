"use client";

import { useEffect, useState } from "react";
import { createRoom, type UserSummary } from "@/lib/api";
import { Avatar } from "./Avatar";
import { UserPicker } from "./UserPicker";

export function CreateRoomDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (roomId: string) => void;
}) {
  const [name, setName] = useState("");
  const [invitees, setInvitees] = useState<UserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setLoading(true);
    try {
      const room = await createRoom(name.trim(), invitees.map((u) => u.pseudo));
      onCreated(room.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room.");
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-5 shadow-2xl"
      >
        <h2 className="text-lg font-semibold text-white">New room</h2>

        {error && (
          <div className="rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-neutral-300">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={64}
            placeholder="e.g. Weekend trip"
            autoFocus
            className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
          />
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-neutral-300">
            Invite people <span className="text-neutral-500 font-normal">(optional)</span>
          </label>
          <UserPicker
            onSelect={(u) => setInvitees((prev) => [...prev, u])}
            excludeIds={invitees.map((u) => u.id)}
          />
          {invitees.length > 0 && (
            <ul className="flex flex-wrap gap-2 pt-1">
              {invitees.map((u) => (
                <li
                  key={u.id}
                  className="flex items-center gap-1.5 bg-neutral-800 border border-neutral-700 rounded-full pl-2 pr-1 py-1 text-xs text-neutral-200"
                >
                  <Avatar user={u} size={16} />
                  {u.pseudo}
                  <button
                    type="button"
                    onClick={() => setInvitees((prev) => prev.filter((p) => p.id !== u.id))}
                    className="w-4 h-4 flex items-center justify-center rounded-full text-neutral-500 hover:text-white hover:bg-neutral-600 transition"
                    aria-label={`Remove ${u.pseudo}`}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 text-sm font-medium text-neutral-300 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg transition"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition"
          >
            {loading ? "Creating…" : "Create room"}
          </button>
        </div>
      </form>
    </div>
  );
}
