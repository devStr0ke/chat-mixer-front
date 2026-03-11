"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getRoom,
  getRoomMessages,
  createChatWebSocket,
  deleteRoom,
  renameRoom,
  addReaction,
  removeReaction,
  type Room,
  type Message,
  type Reaction,
  type WsOutgoing,
  type WsIncoming,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { flagUrl } from "@/lib/countries";

type ConnectionState = "connecting" | "open" | "closed";

const MAX_RECONNECTS = 10;
const RECONNECT_DELAY = 2000;
const TYPING_THROTTLE = 3000;
const TYPING_TIMEOUT = 4000;

export default function ChatPage() {
  const { room_id } = useParams<{ room_id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [connState, setConnState] = useState<ConnectionState>("connecting");
  const [expired, setExpired] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [remaining, setRemaining] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showRename, setShowRename] = useState(false);
  const [contextMsg, setContextMsg] = useState<Message | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reconnectCountRef = useRef(0);
  const localIdRef = useRef(0);
  const lastTypingSentRef = useRef(0);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deletedRef = useRef(false);
  const pendingAckQueue = useRef<string[]>([]);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const messagesRef = useRef<Message[]>([]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  function wsSend(payload: WsOutgoing) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }

  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function init() {
      try {
        const [roomData, history] = await Promise.all([
          getRoom(room_id),
          getRoomMessages(room_id),
        ]);
        if (cancelled) return;

        setRoom(roomData);
        setMessages(history ?? []);
        messagesRef.current = history ?? [];

        if (!roomData.is_active || new Date(roomData.expires_at).getTime() <= Date.now()) {
          setExpired(true);
          setConnState("closed");
          return;
        }

        reconnectTimer = setTimeout(connectWs, 500);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load room.");
          setConnState("closed");
        }
      }
    }

    function connectWs() {
      if (cancelled) return;
      setConnState("connecting");

      const ws = createChatWebSocket(room_id);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        if (cancelled) return;
        reconnectCountRef.current = 0;
        setConnState("open");

        const unread = messagesRef.current.filter(
          (m) => m.sender_id !== user?.id && !m.is_read
        );
        unread.forEach((m) => {
          ws.send(JSON.stringify({ type: "read", id: m.id }));
        });
        if (unread.length > 0) {
          setMessages((prev) =>
            prev.map((m) =>
              m.sender_id !== user?.id && !m.is_read ? { ...m, is_read: true } : m
            )
          );
        }
      });

      ws.addEventListener("message", (e) => {
        if (cancelled) return;
        let incoming: WsIncoming;
        try {
          incoming = JSON.parse(e.data);
        } catch {
          return;
        }

        if (incoming.type === "message") {
          const msg: Message = {
            id: incoming.id,
            sender_id: "partner",
            content: incoming.content,
            is_read: false,
            sent_at: new Date().toISOString(),
            reactions: [],
          };
          setMessages((prev) => [...prev, msg]);
          setPartnerTyping(false);
          wsSend({ type: "read", id: incoming.id });
        }

        if (incoming.type === "message_ack") {
          const localId = pendingAckQueue.current.shift();
          if (localId) {
            setMessages((prev) =>
              prev.map((m) => (m.id === localId ? { ...m, id: incoming.id } : m))
            );
          }
        }

        if (incoming.type === "typing") {
          setPartnerTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setPartnerTyping(false), TYPING_TIMEOUT);
        }

        if (incoming.type === "read") {
          setMessages((prev) =>
            prev.map((m) => (m.id === incoming.id ? { ...m, is_read: true } : m))
          );
        }

        if (incoming.type === "reaction") {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== incoming.message_id) return m;
              if (incoming.action === "remove") {
                return { ...m, reactions: m.reactions.filter((r) => r.user_id !== incoming.user_id) };
              }
              const filtered = m.reactions.filter((r) => r.user_id !== incoming.user_id);
              return { ...m, reactions: [...filtered, { user_id: incoming.user_id, emoji: incoming.emoji }] };
            })
          );
        }
      });

      ws.addEventListener("close", async (e) => {
        if (cancelled) return;
        console.warn(`[WS] closed code=${e.code} reason=${e.reason} attempt=${reconnectCountRef.current}`);
        wsRef.current = null;

        if (deletedRef.current) return;

        try {
          const freshRoom = await getRoom(room_id);
          if (!freshRoom.is_active) {
            deletedRef.current = true;
            setDeleted(true);
            setConnState("closed");
            return;
          }
        } catch {}

        if (reconnectCountRef.current < MAX_RECONNECTS) {
          reconnectCountRef.current += 1;
          setConnState("connecting");
          reconnectTimer = setTimeout(connectWs, RECONNECT_DELAY);
        } else {
          setConnState("closed");
        }
      });

      ws.addEventListener("error", () => {
        // error always fires before close, let close handler deal with reconnect
      });
    }

    init();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [room_id, user]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, partnerTyping, scrollToBottom]);

  useEffect(() => {
    if (!room) return;

    function tick() {
      const diff = new Date(room!.expires_at).getTime() - Date.now();
      if (diff <= 0) {
        setExpired(true);
        setRemaining("0:00:00");
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
        return;
      }
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      setRemaining(`${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    }

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [room]);

  function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !user) return;
    localIdRef.current += 1;
    const localId = `local-${localIdRef.current}`;
    pendingAckQueue.current.push(localId);
    wsSend({ type: "message", content: text });
    const localMsg: Message = {
      id: localId,
      sender_id: user.id,
      content: text,
      is_read: false,
      sent_at: new Date().toISOString(),
      reactions: [],
    };
    setMessages((prev) => [...prev, localMsg]);
    setInput("");
    lastTypingSentRef.current = 0;
    inputRef.current?.focus();
  }

  function handleInputChange(value: string) {
    setInput(value);
    const now = Date.now();
    if (value.trim() && now - lastTypingSentRef.current > TYPING_THROTTLE) {
      lastTypingSentRef.current = now;
      wsSend({ type: "typing" });
    }
  }

  function applyReactionOptimistically(messageId: string, reaction: Reaction | null) {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const filtered = m.reactions.filter((r) => r.user_id !== user?.id);
        return { ...m, reactions: reaction ? [...filtered, reaction] : filtered };
      })
    );
  }

  async function handleReact(messageId: string, emoji: string) {
    setContextMsg(null);
    const existing = messages.find((m) => m.id === messageId)?.reactions.find((r) => r.user_id === user?.id);
    if (existing?.emoji === emoji) {
      applyReactionOptimistically(messageId, null);
      try { await removeReaction(messageId); } catch { applyReactionOptimistically(messageId, existing); }
      return;
    }
    applyReactionOptimistically(messageId, { user_id: user!.id, emoji });
    try { await addReaction(messageId, emoji); } catch { applyReactionOptimistically(messageId, existing ?? null); }
  }

  async function handleRemoveReaction(messageId: string) {
    const existing = messages.find((m) => m.id === messageId)?.reactions.find((r) => r.user_id === user?.id);
    if (!existing) return;
    applyReactionOptimistically(messageId, null);
    try { await removeReaction(messageId); } catch { applyReactionOptimistically(messageId, existing); }
  }

  async function handleDelete() {
    if (!confirm("End this conversation? All messages will be deleted for both users.")) return;
    try {
      await deleteRoom(room_id);
      deletedRef.current = true;
      setDeleted(true);
      setConnState("closed");
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete room.");
    }
  }

  async function handleRename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = renameValue.trim();
    if (!name) return;
    try {
      await renameRoom(room_id, name);
      setRoom((prev) => {
        if (!prev) return prev;
        const isUserA = prev.country_a === user?.country;
        return isUserA
          ? { ...prev, user_a_room_name: name }
          : { ...prev, user_b_room_name: name };
      });
      setShowRename(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename.");
    }
  }

  function partnerCountry(): string {
    if (!room || !user) return "";
    return room.country_a === user.country ? room.country_b : room.country_a;
  }

  function partnerName(): string {
    if (!room || !user) return "Stranger";
    const isUserA = room.country_a === user.country;
    return isUserA ? room.user_a_room_name : room.user_b_room_name;
  }

  if (error) {
    return (
      <div className="min-h-dvh bg-neutral-950 flex flex-col items-center justify-center px-4 gap-4">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={() => router.push("/pool")}
          className="text-sm text-violet-400 hover:text-violet-300 transition"
        >
          Back to pool
        </button>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-dvh bg-neutral-950 flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const ended = expired || deleted;

  return (
    <div className="h-dvh bg-neutral-950 flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/pool")}
            className="text-neutral-500 hover:text-neutral-300 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <img
              src={flagUrl(partnerCountry())}
              alt={partnerCountry()}
              width={20}
              height={15}
              className="rounded-sm object-cover"
            />
            <div className="flex flex-col">
              <span className="text-sm font-medium text-neutral-200 leading-tight">
                {partnerName()}
              </span>
              {partnerTyping && connState === "open" && (
                <span className="text-[11px] text-violet-400 leading-tight">typing…</span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {connState === "open" && !partnerTyping && (
            <span className="flex items-center gap-1.5 text-xs text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Connected
            </span>
          )}
          {connState === "connecting" && (
            <span className="text-xs text-neutral-500">Connecting…</span>
          )}
          {connState === "closed" && !ended && (
            <span className="flex items-center gap-1.5 text-xs text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              Disconnected
            </span>
          )}
          {remaining && !ended && (
            <span className="text-xs font-mono text-neutral-500">{remaining}</span>
          )}

          {!ended && (
            <div className="relative">
              <button
                onClick={() => setShowMenu((v) => !v)}
                className="text-neutral-500 hover:text-neutral-300 transition p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
                </svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-44 bg-neutral-900 border border-neutral-800 rounded-xl shadow-lg z-50 overflow-hidden">
                  <button
                    onClick={() => {
                      setRenameValue(partnerName());
                      setShowRename(true);
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800 transition"
                  >
                    Rename room
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-neutral-800 transition"
                  >
                    End conversation
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {showRename && (
        <div className="border-b border-neutral-800 px-4 py-3 bg-neutral-900/50 flex-shrink-0">
          <form onSubmit={handleRename} className="flex items-center gap-2">
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              maxLength={64}
              placeholder="Enter a name…"
              autoFocus
              className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-violet-500"
            />
            <button
              type="submit"
              disabled={!renameValue.trim()}
              className="px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-40 text-white rounded-lg transition"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setShowRename(false)}
              className="px-3 py-1.5 text-xs text-neutral-400 hover:text-neutral-200 transition"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2" onClick={() => setShowMenu(false)}>
        {messages.length === 0 && !ended && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-neutral-600">Say hi to your stranger.</p>
          </div>
        )}

        {messages.map((msg) => {
          const isOwn = msg.sender_id === user?.id;
          const myReaction = msg.reactions.find((r) => r.user_id === user?.id);
          const partnerReaction = msg.reactions.find((r) => r.user_id !== user?.id);
          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
            >
              <div className={`relative max-w-[75%] flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
                <div
                  className={`rounded-2xl px-4 py-2 text-sm break-words select-none touch-none ${
                    isOwn
                      ? "bg-violet-600 text-white rounded-br-md"
                      : "bg-neutral-800 text-neutral-100 rounded-bl-md"
                  }`}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    holdTimerRef.current = setTimeout(() => {
                      holdTimerRef.current = null;
                      lastTapRef.current = null;
                      setContextMsg(msg);
                    }, 400);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    if (holdTimerRef.current) {
                      clearTimeout(holdTimerRef.current);
                      holdTimerRef.current = null;
                      const now = Date.now();
                      const last = lastTapRef.current;
                      if (last?.id === msg.id && now - last.time < 300) {
                        lastTapRef.current = null;
                        handleReact(msg.id, "❤️");
                      } else {
                        lastTapRef.current = { id: msg.id, time: now };
                      }
                    }
                  }}
                  onPointerLeave={() => {
                    if (holdTimerRef.current) {
                      clearTimeout(holdTimerRef.current);
                      holdTimerRef.current = null;
                    }
                  }}
                >
                  <p>{msg.content}</p>
                  <div className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : ""}`}>
                    <span className={`text-[10px] ${isOwn ? "text-violet-300" : "text-neutral-500"}`}>
                      {new Date(msg.sent_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {isOwn && (
                      <svg
                        className={`w-3.5 h-3.5 ${msg.is_read ? "text-violet-300" : "text-violet-400/40"}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        {msg.is_read ? (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M1 12l5 5L17 6M7 12l5 5L23 6" />
                        ) : (
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12l5 5L20 7" />
                        )}
                      </svg>
                    )}
                  </div>
                </div>

                {/* Reaction badges */}
                {(myReaction || partnerReaction) && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {partnerReaction && (
                      <span className="text-sm leading-none bg-neutral-800 border border-neutral-700 rounded-full px-2 py-0.5">
                        {partnerReaction.emoji}
                      </span>
                    )}
                    {myReaction && (
                      <button
                        onClick={() => handleRemoveReaction(msg.id)}
                        className="text-sm leading-none bg-violet-600/20 border border-violet-500/40 rounded-full px-2 py-0.5 hover:bg-red-900/30 hover:border-red-500/40 transition"
                        title="Remove your reaction"
                      >
                        {myReaction.emoji}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {partnerTyping && connState === "open" && (
          <div className="flex justify-start">
            <div className="bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {deleted ? (
        <div className="border-t border-neutral-800 px-4 py-5 text-center flex-shrink-0">
          <p className="text-sm text-neutral-400 mb-3">This conversation has ended.</p>
          <button
            onClick={() => router.push("/pool")}
            className="px-5 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition"
          >
            Find a new match
          </button>
        </div>
      ) : expired ? (
        <div className="border-t border-neutral-800 px-4 py-5 text-center flex-shrink-0">
          <p className="text-sm text-neutral-400 mb-3">This room has expired.</p>
          <button
            onClick={() => router.push("/pool")}
            className="px-5 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition"
          >
            Find a new match
          </button>
        </div>
      ) : (
        <form
          onSubmit={handleSend}
          className="border-t border-neutral-800 px-4 py-3 flex items-center gap-3 flex-shrink-0"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={connState === "open" ? "Type a message…" : "Waiting for connection…"}
            disabled={connState !== "open"}
            autoFocus
            className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={connState !== "open" || !input.trim()}
            className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl p-2.5 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </form>
      )}

      {/* Long-press reaction overlay */}
      {contextMsg && (() => {
        const isOwn = contextMsg.sender_id === user?.id;
        const myReaction = contextMsg.reactions.find((r) => r.user_id === user?.id);
        const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏"];
        return (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 px-6"
            style={{ backdropFilter: "blur(8px)", backgroundColor: "rgba(0,0,0,0.6)" }}
            onClick={() => setContextMsg(null)}
          >
            {/* Frozen bubble */}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm pointer-events-none ${
                isOwn
                  ? "bg-violet-600 text-white rounded-br-md self-end"
                  : "bg-neutral-800 text-neutral-100 rounded-bl-md self-start"
              }`}
            >
              <p>{contextMsg.content}</p>
              <div className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : ""}`}>
                <span className={`text-[10px] ${isOwn ? "text-violet-300" : "text-neutral-500"}`}>
                  {new Date(contextMsg.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>

            {/* Emoji strip */}
            <div
              className="flex items-center gap-2 bg-neutral-900 border border-neutral-700 rounded-full px-3 py-2 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => handleReact(contextMsg.id, emoji)}
                  className={`text-2xl leading-none w-10 h-10 flex items-center justify-center rounded-full transition hover:scale-125 active:scale-110 ${
                    myReaction?.emoji === emoji ? "bg-violet-600/30 ring-2 ring-violet-500 scale-110" : ""
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
