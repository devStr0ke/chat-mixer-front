"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  getMyRooms,
  getMyInvitations,
  acceptInvitation,
  deleteInvitation,
  createNotificationWebSocket,
  type RoomSummary,
  type Invitation,
  type WsNotification,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { formatShort } from "@/lib/format";
import { Flag } from "@/components/Flag";
import { CreateRoomDialog } from "@/components/CreateRoomDialog";

export default function RoomsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlineLabel, setOnlineLabel] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [pendingInvite, setPendingInvite] = useState<string | null>(null);

  const roomsRef = useRef<RoomSummary[]>([]);
  const notifWsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchRooms = useCallback(async () => {
    try {
      setRooms(await getMyRooms());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load rooms.");
    }
  }, []);

  const fetchInvitations = useCallback(async () => {
    try {
      setInvitations(await getMyInvitations());
    } catch {
      /* non-blocking: rooms list is the main content */
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchRooms(), fetchInvitations()]).finally(() => setLoading(false));
  }, [fetchRooms, fetchInvitations]);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;

    let alive = true;
    let retries = 0;
    const MAX_RETRIES = 5;

    function connect() {
      if (!alive) return;
      const ws = createNotificationWebSocket();
      notifWsRef.current = ws;

      ws.onopen = () => {
        retries = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg: WsNotification = JSON.parse(event.data);
          switch (msg.type) {
            case "online_count": {
              const others = msg.count - 1;
              if (others <= 0) {
                setOnlineLabel("Only you are online");
              } else if (others === 1) {
                setOnlineLabel("You and 1 other user online");
              } else {
                setOnlineLabel(`You and ${others} other users online`);
              }
              break;
            }
            case "new_message": {
              if (!roomsRef.current.some((r) => r.id === msg.room_id)) {
                fetchRooms();
                break;
              }
              setRooms((prev) => {
                const room = prev.find((r) => r.id === msg.room_id);
                if (!room) return prev;
                const updated: RoomSummary = {
                  ...room,
                  unread_count: room.unread_count + 1,
                  last_message: {
                    id: msg.id,
                    sender_id: msg.sender_id,
                    sender_pseudo: msg.sender_pseudo,
                    content: msg.content,
                    sent_at: msg.sent_at,
                  },
                };
                return [updated, ...prev.filter((r) => r.id !== msg.room_id)];
              });
              break;
            }
            case "invitation":
              fetchInvitations();
              break;
            case "room_removed":
              setRooms((prev) => prev.filter((r) => r.id !== msg.room_id));
              break;
          }
        } catch { /* ignore malformed frames */ }
      };

      ws.onclose = (e) => {
        if (!alive) return;
        if (e.code === 1000) return;
        if (retries >= MAX_RETRIES) return;
        retries++;
        reconnectTimerRef.current = setTimeout(connect, 3000 * retries);
      };
    }

    const initTimer = setTimeout(connect, 100);

    return () => {
      alive = false;
      clearTimeout(initTimer);
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (notifWsRef.current) {
        notifWsRef.current.onclose = null;
        notifWsRef.current.close(1000);
        notifWsRef.current = null;
      }
    };
  }, [fetchRooms, fetchInvitations]);

  async function handleAccept(invitation: Invitation) {
    setError(null);
    setPendingInvite(invitation.id);
    try {
      const { room_id } = await acceptInvitation(invitation.id);
      router.push(`/chat/${room_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation.");
      setPendingInvite(null);
      fetchInvitations();
    }
  }

  async function handleDecline(invitation: Invitation) {
    setError(null);
    setInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
    try {
      await deleteInvitation(invitation.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to decline invitation.");
      fetchInvitations();
    }
  }

  function handleLogout() {
    clearAuth();
    router.push("/login");
  }

  function preview(room: RoomSummary): string {
    const last = room.last_message;
    if (!last) {
      return room.member_count === 1
        ? "No messages yet · just you"
        : `No messages yet · ${room.member_count} members`;
    }
    const who = last.sender_id === user?.id ? "You" : last.sender_pseudo;
    return `${who}: ${last.content}`;
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-neutral-800">
        <span className="text-lg font-bold text-white">
          Chat<span className="text-violet-500">Mixer</span>
        </span>
        <div className="flex items-center gap-3">
          {user && (
            <span className="flex items-center gap-2 text-sm text-neutral-400">
              <Flag code={user.country} />
              <span className="text-neutral-300 font-medium">{user.pseudo}</span>
            </span>
          )}
          <button
            onClick={handleLogout}
            className="text-xs text-neutral-500 hover:text-neutral-300 transition"
          >
            Log out
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-4 py-8 space-y-8">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-2xl font-bold text-white">Rooms</h2>
            {onlineLabel !== null && (
              <p className="text-xs text-neutral-500 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {onlineLabel}
              </p>
            )}
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl px-4 py-2.5 transition shadow-lg shadow-violet-900/30"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 5v14M5 12h14" />
            </svg>
            New room
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {invitations.length > 0 && (
          <section className="space-y-2">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">Invitations</p>
            <ul className="space-y-2">
              {invitations.map((inv) => (
                <li
                  key={inv.id}
                  className="bg-violet-950/30 border border-violet-800/50 rounded-xl px-4 py-3 space-y-3"
                >
                  <p className="text-sm text-neutral-300">
                    <span className="inline-flex items-center gap-1.5 align-middle">
                      <Flag code={inv.inviter.country} width={16} />
                      <span className="font-medium text-white">{inv.inviter.pseudo}</span>
                    </span>{" "}
                    invited you to <span className="font-medium text-white">{inv.room_name}</span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept(inv)}
                      disabled={pendingInvite === inv.id}
                      className="flex-1 bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white text-sm font-medium rounded-lg py-2 transition"
                    >
                      {pendingInvite === inv.id ? "Joining…" : "Accept"}
                    </button>
                    <button
                      onClick={() => handleDecline(inv)}
                      disabled={pendingInvite === inv.id}
                      className="flex-1 text-sm font-medium text-neutral-300 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg py-2 transition"
                    >
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="space-y-2">
          {loading ? (
            <div className="flex justify-center py-12">
              <span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : rooms.length === 0 ? (
            <div className="text-center py-12 space-y-2 border border-dashed border-neutral-800 rounded-2xl">
              <p className="text-sm text-neutral-300">No rooms yet</p>
              <p className="text-xs text-neutral-500">Create one and invite your friends.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {rooms.map((room) => (
                <li key={room.id}>
                  <button
                    onClick={() => router.push(`/chat/${room.id}`)}
                    className="w-full flex items-center gap-3 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl px-4 py-3 text-left transition group"
                  >
                    <span className="flex-shrink-0 w-10 h-10 rounded-full bg-violet-600/20 text-violet-300 flex items-center justify-center font-semibold uppercase">
                      {room.name.charAt(0)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-sm font-medium text-neutral-200 group-hover:text-white transition truncate">
                          {room.name}
                        </p>
                        <span className="text-[11px] text-neutral-500 flex-shrink-0">
                          {formatShort(room.last_message?.sent_at ?? room.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className={`text-xs truncate ${
                            room.unread_count > 0 ? "text-neutral-300" : "text-neutral-500"
                          }`}
                        >
                          {preview(room)}
                        </p>
                        {room.unread_count > 0 && (
                          <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-violet-600 text-[11px] font-semibold text-white tabular-nums">
                            {room.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      {showCreate && (
        <CreateRoomDialog
          onClose={() => setShowCreate(false)}
          onCreated={(roomId) => router.push(`/chat/${roomId}`)}
        />
      )}
    </div>
  );
}
