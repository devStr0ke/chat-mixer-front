"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getRoom,
  getRoomMessages,
  createChatWebSocket,
  type Room,
  type Message,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { flagUrl } from "@/lib/countries";

type ConnectionState = "connecting" | "open" | "closed";

export default function ChatPage() {
  const { room_id } = useParams<{ room_id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [connState, setConnState] = useState<ConnectionState>("connecting");
  const [expired, setExpired] = useState(false);
  const [remaining, setRemaining] = useState("");
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reconnectCountRef = useRef(0);
  const MAX_RECONNECTS = 10;
  const RECONNECT_DELAY = 2000;

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

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
      });

      ws.addEventListener("message", (e) => {
        if (cancelled) return;
        try {
          const incoming: Message = JSON.parse(e.data);
          setMessages((prev) => [...prev, incoming]);
        } catch {
          // ignore non-JSON frames
        }
      });

      ws.addEventListener("close", (e) => {
        if (cancelled) return;
        console.warn(`[WS] closed code=${e.code} reason=${e.reason} attempt=${reconnectCountRef.current}`);
        wsRef.current = null;
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
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [room_id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

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
    if (!text || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(text);
    setInput("");
    inputRef.current?.focus();
  }

  function partnerCountry(): string {
    if (!room || !user) return "";
    return room.country_a === user.country ? room.country_b : room.country_a;
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
            <span className="text-sm font-medium text-neutral-200">Stranger</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {connState === "open" && (
            <span className="flex items-center gap-1.5 text-xs text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              Connected
            </span>
          )}
          {connState === "connecting" && (
            <span className="text-xs text-neutral-500">Connecting…</span>
          )}
          {connState === "closed" && !expired && (
            <span className="flex items-center gap-1.5 text-xs text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              Disconnected
            </span>
          )}
          {remaining && (
            <span className="text-xs font-mono text-neutral-500">{remaining}</span>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 && !expired && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-neutral-600">Say hi to your stranger.</p>
          </div>
        )}

        {messages.map((msg) => {
          const isOwn = msg.sender_id === user?.id;
          return (
            <div
              key={msg.id}
              className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2 text-sm break-words ${
                  isOwn
                    ? "bg-violet-600 text-white rounded-br-md"
                    : "bg-neutral-800 text-neutral-100 rounded-bl-md"
                }`}
              >
                <p>{msg.content}</p>
                <p
                  className={`text-[10px] mt-1 ${
                    isOwn ? "text-violet-300" : "text-neutral-500"
                  }`}
                >
                  {new Date(msg.sent_at).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {expired ? (
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
            onChange={(e) => setInput(e.target.value)}
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
    </div>
  );
}
