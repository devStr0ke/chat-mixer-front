"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  joinPool,
  leavePool,
  getMyRooms,
  getRoomMessages,
  createNotificationWebSocket,
  type Room,
  type WsNotification,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { flagUrl } from "@/lib/countries";

type PoolState = "idle" | "searching" | "matched";

const POLL_INTERVAL = 4000;

function isAlreadyInPoolError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("already") && msg.includes("pool");
}

export default function PoolPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  const [state, setState] = useState<PoolState>("idle");
  const [sameCountry, setSameCountry] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [activeRooms, setActiveRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [onlineCount, setOnlineCount] = useState<number | null>(null);

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const startTimeRef = useRef<number>(0);
  const knownRoomIdsRef = useRef<Set<string>>(new Set());
  const notifWsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const closeNotifWs = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (notifWsRef.current) {
      notifWsRef.current.onclose = null;
      notifWsRef.current.close(1000);
      notifWsRef.current = null;
    }
  }, []);

  const fetchActiveRooms = useCallback(async () => {
    try {
      const rooms = await getMyRooms();
      const now = Date.now();
      const active = (rooms ?? []).filter(
        (r) => r.is_active && new Date(r.expires_at).getTime() > now
      );
      setActiveRooms(active);

      const counts: Record<string, number> = {};
      await Promise.all(
        active.map(async (room) => {
          try {
            const msgs = await getRoomMessages(room.id);
            counts[room.id] = (msgs ?? []).filter(
              (m) => m.sender_id !== user?.id && !m.is_read
            ).length;
          } catch {
            counts[room.id] = 0;
          }
        })
      );
      setUnreadCounts(counts);
    } catch {
      setActiveRooms([]);
    } finally {
      setLoadingRooms(false);
    }
  }, [user]);

  useEffect(() => {
    fetchActiveRooms();
  }, [fetchActiveRooms]);

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
            case "online_count":
              setOnlineCount(msg.count);
              break;
            case "new_message":
              setUnreadCounts((prev) => ({
                ...prev,
                [msg.room_id]: (prev[msg.room_id] ?? 0) + 1,
              }));
              break;
            case "room_closed":
              setActiveRooms((prev) => prev.filter((r) => r.id !== msg.room_id));
              setUnreadCounts((prev) => {
                const next = { ...prev };
                delete next[msg.room_id];
                return next;
              });
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
      closeNotifWs();
    };
  }, [closeNotifWs]);

  const stopPolling = useCallback(() => {
    activeRef.current = false;
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    if (!activeRef.current) return;
    try {
      const rooms = await getMyRooms();
      if (!activeRef.current) return;
      const now = Date.now();
      const newRoom = (rooms ?? []).find(
        (r) =>
          r.is_active &&
          new Date(r.expires_at).getTime() > now &&
          !knownRoomIdsRef.current.has(r.id)
      );
      if (newRoom) {
        stopPolling();
        setState("matched");
        try { await leavePool(); } catch {}
        closeNotifWs();
        router.push(`/chat/${newRoom.id}`);
        return;
      }
      pollingRef.current = setTimeout(poll, POLL_INTERVAL);
    } catch {
      if (!activeRef.current) return;
      pollingRef.current = setTimeout(poll, POLL_INTERVAL);
    }
  }, [router, stopPolling, closeNotifWs]);

  const handleSearch = useCallback(async () => {
    setError(null);
    setState("searching");
    setElapsed(0);
    startTimeRef.current = Date.now();
    activeRef.current = true;

    try {
      const existingRooms = await getMyRooms();
      knownRoomIdsRef.current = new Set((existingRooms ?? []).map((r) => r.id));
    } catch {
      knownRoomIdsRef.current = new Set();
    }

    try {
      const data = await joinPool(sameCountry);
      if (!activeRef.current) return;
      if (data.room_id) {
        stopPolling();
        setState("matched");
        try { await leavePool(); } catch {}
        closeNotifWs();
        router.push(`/chat/${data.room_id}`);
        return;
      }
      pollingRef.current = setTimeout(poll, POLL_INTERVAL);
    } catch (err) {
      if (!activeRef.current) return;
      if (isAlreadyInPoolError(err)) {
        pollingRef.current = setTimeout(poll, POLL_INTERVAL);
        return;
      }
      stopPolling();
      setState("idle");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }, [sameCountry, router, poll, stopPolling, closeNotifWs]);

  const handleCancel = useCallback(async () => {
    stopPolling();
    setState("idle");
    setElapsed(0);
    try {
      await leavePool();
    } catch { /* ignore */ }
  }, [stopPolling]);

  useEffect(() => {
    if (state !== "searching") return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  async function handleLogout() {
    stopPolling();
    closeNotifWs();
    try {
      await leavePool();
    } catch { /* not in pool, ignore */ }
    clearAuth();
    router.push("/login");
  }

  function formatElapsed(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function formatRemaining(expiresAt: string): string {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return "Expired";
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    return `${h}h ${m}m left`;
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
              <img
                src={flagUrl(user.country)}
                alt={user.country}
                width={20}
                height={15}
                className="rounded-sm object-cover"
              />
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

      <main className="flex-1 flex flex-col items-center justify-center px-4 gap-8">
        {state === "idle" && (
          <div className="text-center space-y-6 w-full max-w-xs">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-white">Find a stranger</h2>
              <p className="text-sm text-neutral-400">
                Get matched with a random anonymous user for a 24h chat.
              </p>
              {onlineCount !== null && (
                <p className="text-xs text-neutral-500 flex items-center justify-center gap-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {onlineCount === 1 ? "1 user online" : `${onlineCount} users online`}
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300 text-left">
                {error}
              </div>
            )}

            {!loadingRooms && activeRooms.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider text-left">
                  Active rooms
                </p>
                <ul className="space-y-2">
                  {activeRooms.map((room) => {
                    const partnerCountry =
                      room.country_a === user?.country
                        ? room.country_b
                        : room.country_a;
                    const roomName =
                      room.country_a === user?.country
                        ? room.user_a_room_name
                        : room.user_b_room_name;
                    return (
                      <li key={room.id}>
                        <button
                          onClick={() => {
                            closeNotifWs();
                            router.push(`/chat/${room.id}`);
                          }}
                          className="w-full flex items-center gap-3 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl px-4 py-3 text-left transition group"
                        >
                          <img
                            src={flagUrl(partnerCountry)}
                            alt={partnerCountry}
                            width={24}
                            height={18}
                            className="rounded-sm object-cover flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-neutral-200 group-hover:text-white transition">
                              {roomName || "Stranger"}
                            </p>
                            <p className="text-xs text-neutral-500">
                              {formatRemaining(room.expires_at)}
                            </p>
                          </div>
                          {(unreadCounts[room.id] ?? 0) > 0 ? (
                            <span className="flex-shrink-0 min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full bg-violet-600 text-[11px] font-semibold text-white tabular-nums">
                              {unreadCounts[room.id]}
                            </span>
                          ) : (
                            <svg
                              className="w-4 h-4 text-neutral-600 group-hover:text-neutral-400 transition flex-shrink-0"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <label className="flex items-center justify-between bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-3 cursor-pointer group">
              <div>
                <p className="text-sm font-medium text-neutral-200 group-hover:text-white transition">
                  Same country only
                </p>
                <p className="text-xs text-neutral-500 flex items-center gap-1">
                  Match with someone from{" "}
                  {user ? (
                    <img
                      src={flagUrl(user.country)}
                      alt={user.country}
                      width={16}
                      height={12}
                      className="rounded-sm object-cover inline"
                    />
                  ) : (
                    "your country"
                  )}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={sameCountry}
                onClick={() => setSameCountry((v) => !v)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  sameCountry ? "bg-violet-600" : "bg-neutral-700"
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    sameCountry ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </label>

            <button
              onClick={handleSearch}
              className="w-full bg-violet-600 hover:bg-violet-500 text-white font-semibold rounded-xl py-3 text-base transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-neutral-950 shadow-lg shadow-violet-900/30"
            >
              Find a match
            </button>
          </div>
        )}

        {state === "searching" && (
          <div className="text-center space-y-8">
            <div className="relative flex items-center justify-center">
              <span className="absolute w-28 h-28 rounded-full bg-violet-600/20 animate-ping" />
              <span className="absolute w-20 h-20 rounded-full bg-violet-600/30 animate-ping [animation-delay:150ms]" />
              <span className="relative w-16 h-16 rounded-full bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-800/50">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
            </div>

            <div className="space-y-1">
              <p className="text-lg font-semibold text-white">Searching for a match…</p>
              <p className="text-sm text-neutral-400">
                {sameCountry ? "Looking for someone in your country" : "Looking worldwide"}
              </p>
              <p className="text-xs text-neutral-500 font-mono mt-2">
                {formatElapsed(elapsed)}
              </p>
              {onlineCount !== null && (
                <p className="text-xs text-neutral-500 flex items-center justify-center gap-1.5 mt-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  {onlineCount === 1 ? "1 user online" : `${onlineCount} users online`}
                </p>
              )}
            </div>

            <button
              onClick={handleCancel}
              className="px-6 py-2.5 text-sm font-medium text-neutral-300 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-xl transition"
            >
              Cancel
            </button>
          </div>
        )}

        {state === "matched" && (
          <div className="text-center space-y-4">
            <p className="text-lg font-semibold text-white">Match found!</p>
            <p className="text-sm text-neutral-400">Redirecting to chat…</p>
          </div>
        )}
      </main>
    </div>
  );
}
