"use client";

import { Fragment, useState, useEffect, useLayoutEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  getRoom,
  getRoomMessages,
  createChatWebSocket,
  deleteRoom,
  renameRoom,
  removeMember,
  addReaction,
  removeReaction,
  ACCEPTED_IMAGE_TYPES,
  type RoomDetail,
  type Member,
  type Message,
  type Reaction,
  type WsOutgoing,
  type WsIncoming,
} from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { formatTime, formatDay, sameDay, nameColor } from "@/lib/format";
import { MembersPanel } from "@/components/MembersPanel";
import { Avatar } from "@/components/Avatar";
import { AttachmentGrid, type DisplayAttachment } from "@/components/AttachmentGrid";
import { Lightbox } from "@/components/Lightbox";
import { PendingUploads } from "@/components/PendingUploads";
import { useAttachmentUploads } from "@/lib/useAttachmentUploads";

type ConnectionState = "connecting" | "open" | "closed";

/** A message as shown locally: optimistic sends carry a client_id until acked. */
type ChatMessage = Omit<Message, "attachments"> & {
  attachments: DisplayAttachment[];
  client_id?: string;
  status?: "pending" | "failed";
};

const MAX_RECONNECTS = 10;
const RECONNECT_DELAY = 2000;
const TYPING_THROTTLE = 3000;
const TYPING_TIMEOUT = 4000;
const LOAD_OLDER_THRESHOLD = 80;
const NEAR_BOTTOM = 120;
const EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "👏"];

function isStatus(err: unknown, status: number): boolean {
  return (err as { status?: number } | null)?.status === status;
}

/** Merges fetched messages into the local list by id, keeping chronological order. */
function mergeMessages(local: ChatMessage[], fetched: Message[]): ChatMessage[] {
  const known = new Set(local.map((m) => m.id));
  const added = fetched.filter((m) => !known.has(m.id));
  if (added.length === 0) return local;
  return [...local, ...added].sort(
    (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
  );
}

function typingLabel(names: string[]): string {
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return "Several people are typing…";
}

export default function ChatPage() {
  const { room_id } = useParams<{ room_id: string }>();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [input, setInput] = useState("");
  const [connState, setConnState] = useState<ConnectionState>("connecting");
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});
  const [showMenu, setShowMenu] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showRename, setShowRename] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [roomVersion, setRoomVersion] = useState(0);
  const [contextMsg, setContextMsg] = useState<ChatMessage | null>(null);
  // desktop reaction picker, anchored to a message; opens below when near the top of the list
  const [picker, setPicker] = useState<{ id: string; below: boolean } | null>(null);
  const [lightbox, setLightbox] = useState<{ items: DisplayAttachment[]; index: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reconnectCountRef = useRef(0);
  const localIdRef = useRef(0);
  const lastTypingSentRef = useRef(0);
  const typingTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const removedRef = useRef(false);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerTypeRef = useRef<string>("mouse");
  // a long-press opens the reaction overlay; swallow the click that follows it
  const holdFiredRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);

  const composer = useAttachmentUploads(room_id, setError);
  const messagesRef = useRef<ChatMessage[]>([]);
  const nearBottomRef = useRef(true);
  const scrollModeRef = useRef<"none" | "bottom" | "restore">("none");
  const restoreRef = useRef({ height: 0, top: 0 });

  function wsSend(payload: WsOutgoing) {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }

  const markRemoved = useCallback(() => {
    removedRef.current = true;
    setRemoved(true);
    setConnState("closed");
    setShowMembers(false);
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const refreshRoom = useCallback(async () => {
    try {
      setRoom(await getRoom(room_id));
      setRoomVersion((v) => v + 1);
    } catch (err) {
      if (isStatus(err, 404)) markRemoved();
    }
  }, [room_id, markRemoved]);

  const clearTyping = useCallback((id: string) => {
    clearTimeout(typingTimersRef.current[id]);
    delete typingTimersRef.current[id];
    setTypingUsers((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    const typingTimers = typingTimersRef.current;

    async function init() {
      try {
        const [roomData, page] = await Promise.all([getRoom(room_id), getRoomMessages(room_id)]);
        if (cancelled) return;

        setRoom(roomData);
        scrollModeRef.current = "bottom";
        setMessages(page.messages);
        messagesRef.current = page.messages;
        setHasMore(page.has_more);

        reconnectTimer = setTimeout(connectWs, 300);
      } catch (err) {
        if (cancelled) return;
        if (isStatus(err, 404)) {
          setError("This room doesn't exist or you're not a member.");
        } else {
          setError(err instanceof Error ? err.message : "Failed to load room.");
        }
        setConnState("closed");
      }
    }

    function markLatestRead(ws: WebSocket) {
      const latest = messagesRef.current.findLast((m) => !m.status);
      if (latest && latest.sender_id !== userId) {
        ws.send(JSON.stringify({ type: "read", id: latest.id }));
      }
    }

    // After a reconnect, pick up whatever was sent while we were away.
    async function catchUp(ws: WebSocket) {
      try {
        const page = await getRoomMessages(room_id);
        if (cancelled) return;
        setMessages((prev) => mergeMessages(prev, page.messages));
        messagesRef.current = mergeMessages(messagesRef.current, page.messages);
        refreshRoom();
        if (ws.readyState === WebSocket.OPEN) markLatestRead(ws);
      } catch { /* the close handler deals with lost access */ }
    }

    function connectWs() {
      if (cancelled) return;
      setConnState("connecting");

      const ws = createChatWebSocket(room_id);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        if (cancelled) return;
        const isReconnect = reconnectCountRef.current > 0;
        reconnectCountRef.current = 0;
        setConnState("open");
        if (isReconnect) {
          catchUp(ws);
        } else {
          markLatestRead(ws);
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

        switch (incoming.type) {
          case "message": {
            const msg: ChatMessage = {
              id: incoming.id,
              sender_id: incoming.sender_id,
              sender_pseudo: incoming.sender_pseudo,
              content: incoming.content ?? "",
              sent_at: incoming.sent_at,
              reactions: [],
              attachments: incoming.attachments ?? [],
            };
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
            clearTyping(incoming.sender_id);
            if (incoming.sender_id !== userId) {
              wsSend({ type: "read", id: incoming.id });
            }
            break;
          }

          case "message_ack":
            setMessages((prev) =>
              prev.map((m) =>
                m.client_id === incoming.client_id
                  ? { ...m, id: incoming.id, sent_at: incoming.sent_at, status: undefined }
                  : m
              )
            );
            break;

          case "message_error":
            setMessages((prev) =>
              prev.map((m) => (m.client_id === incoming.client_id ? { ...m, status: "failed" } : m))
            );
            break;

          case "typing": {
            if (incoming.user_id === userId) break;
            const id = incoming.user_id;
            setTypingUsers((prev) => ({ ...prev, [id]: incoming.pseudo }));
            clearTimeout(typingTimersRef.current[id]);
            typingTimersRef.current[id] = setTimeout(() => clearTyping(id), TYPING_TIMEOUT);
            break;
          }

          case "read":
            setRoom((prev) =>
              prev && {
                ...prev,
                members: prev.members.map((m) =>
                  m.id === incoming.user_id ? { ...m, last_read_at: incoming.read_at } : m
                ),
              }
            );
            break;

          case "reaction":
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id !== incoming.message_id) return m;
                const others = m.reactions.filter((r) => r.user_id !== incoming.user_id);
                if (incoming.action === "remove") return { ...m, reactions: others };
                return { ...m, reactions: [...others, { user_id: incoming.user_id, emoji: incoming.emoji }] };
              })
            );
            break;

          case "member_joined":
          case "member_left":
          case "room_updated":
            refreshRoom();
            break;
        }
      });

      ws.addEventListener("close", async (e) => {
        if (cancelled) return;
        console.warn(`[WS] closed code=${e.code} reason=${e.reason} attempt=${reconnectCountRef.current}`);
        wsRef.current = null;
        setTypingUsers({});
        // anything still waiting for an ack may or may not have been saved
        setMessages((prev) =>
          prev.some((m) => m.status === "pending")
            ? prev.map((m) => (m.status === "pending" ? { ...m, status: "failed" } : m))
            : prev
        );

        if (removedRef.current) return;

        try {
          await getRoom(room_id);
        } catch (err) {
          if (isStatus(err, 404)) {
            markRemoved();
            return;
          }
        }

        if (reconnectCountRef.current < MAX_RECONNECTS) {
          reconnectCountRef.current += 1;
          setConnState("connecting");
          reconnectTimer = setTimeout(connectWs, RECONNECT_DELAY);
        } else {
          setConnState("closed");
        }
      });
    }

    init();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      Object.values(typingTimers).forEach(clearTimeout);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [room_id, userId, refreshRoom, markRemoved, clearTyping]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (!picker) return;
    function handleMouseDown(e: MouseEvent) {
      if (!(e.target as Element).closest("[data-reaction-picker]")) setPicker(null);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPicker(null);
    }
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKey);
    };
  }, [picker]);

  const typingCount = Object.keys(typingUsers).length;

  // Keep the view pinned: jump to the bottom on load/send, follow new messages
  // when already near the bottom, and hold position when older ones are prepended.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const mode = scrollModeRef.current;
    scrollModeRef.current = "none";
    if (mode === "restore") {
      el.scrollTop = restoreRef.current.top + (el.scrollHeight - restoreRef.current.height);
    } else if (mode === "bottom" || nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, typingCount]);

  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current.find((m) => !m.status);
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await getRoomMessages(room_id, oldest.id);
      const el = scrollRef.current;
      if (el) {
        restoreRef.current = { height: el.scrollHeight, top: el.scrollTop };
        scrollModeRef.current = "restore";
      }
      setMessages((prev) => {
        const known = new Set(prev.map((m) => m.id));
        return [...page.messages.filter((m) => !known.has(m.id)), ...prev];
      });
      setHasMore(page.has_more);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load older messages.");
    } finally {
      setLoadingOlder(false);
    }
  }, [room_id, loadingOlder]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    if (el.scrollTop < LOAD_OLDER_THRESHOLD && hasMore && !loadingOlder) {
      loadOlder();
    }
  }

  function sendContent(text: string, attachments: DisplayAttachment[] = []) {
    if (!user) return;
    localIdRef.current += 1;
    const clientId = `local-${Date.now()}-${localIdRef.current}`;
    wsSend({
      type: "message",
      content: text,
      client_id: clientId,
      ...(attachments.length > 0 && { attachment_ids: attachments.map((a) => a.id) }),
    });
    const localMsg: ChatMessage = {
      id: clientId,
      client_id: clientId,
      status: "pending",
      sender_id: user.id,
      sender_pseudo: user.pseudo,
      content: text,
      sent_at: new Date().toISOString(),
      reactions: [],
      attachments,
    };
    scrollModeRef.current = "bottom";
    setMessages((prev) => [...prev, localMsg]);
  }

  function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = input.trim();
    if (composer.blocked || (!text && composer.ready === 0)) return;
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    sendContent(text, composer.take());
    setInput("");
    lastTypingSentRef.current = 0;
    inputRef.current?.focus();
  }

  function handleRetry(msg: ChatMessage) {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    setMessages((prev) => prev.filter((m) => m.id !== msg.id));
    sendContent(msg.content, msg.attachments);
  }

  function imageFiles(list: FileList | null | undefined): File[] {
    return Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const files = imageFiles(e.clipboardData.files);
    if (files.length === 0) return;
    e.preventDefault();
    composer.addFiles(files);
  }

  function handleDragEnter(e: React.DragEvent) {
    if (removed || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepthRef.current += 1;
    setDragging(true);
  }

  function handleDragLeave() {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    if (removed) return;
    composer.addFiles(Array.from(e.dataTransfer.files));
  }

  function openLightbox(msg: ChatMessage, index: number) {
    if (holdFiredRef.current) {
      holdFiredRef.current = false;
      return;
    }
    setLightbox({ items: msg.attachments, index });
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
        const others = m.reactions.filter((r) => r.user_id !== userId);
        return { ...m, reactions: reaction ? [...others, reaction] : others };
      })
    );
  }

  function cancelHold() {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function togglePicker(messageId: string, anchor: Element) {
    if (picker?.id === messageId) {
      setPicker(null);
      return;
    }
    const container = scrollRef.current;
    const below = container
      ? anchor.getBoundingClientRect().top - container.getBoundingClientRect().top < 56
      : false;
    setPicker({ id: messageId, below });
  }

  async function handleReact(messageId: string, emoji: string) {
    setContextMsg(null);
    setPicker(null);
    if (!userId) return;
    const existing = messages.find((m) => m.id === messageId)?.reactions.find((r) => r.user_id === userId);
    if (existing?.emoji === emoji) {
      applyReactionOptimistically(messageId, null);
      try { await removeReaction(messageId); } catch { applyReactionOptimistically(messageId, existing); }
      return;
    }
    applyReactionOptimistically(messageId, { user_id: userId, emoji });
    try { await addReaction(messageId, emoji); } catch { applyReactionOptimistically(messageId, existing ?? null); }
  }

  async function handleRename(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = renameValue.trim();
    if (!name) return;
    try {
      await renameRoom(room_id, name);
      setRoom((prev) => prev && { ...prev, name });
      setShowRename(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to rename.");
    }
  }

  async function handleRemoveMember(member: Member) {
    if (!confirm(`Remove ${member.pseudo} from this room?`)) return;
    try {
      await removeMember(room_id, member.id);
      refreshRoom();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member.");
    }
  }

  async function handleLeave() {
    if (!room || !userId) return;
    const isOwner = room.owner_id === userId;
    const note =
      isOwner && room.members.length > 1
        ? " Ownership will pass to the longest-standing member."
        : isOwner
          ? " You're the last member, so the room will be deleted."
          : "";
    if (!confirm(`Leave "${room.name}"?${note}`)) return;
    try {
      removedRef.current = true;
      await removeMember(room_id, userId);
      router.push("/rooms");
    } catch (err) {
      removedRef.current = false;
      setError(err instanceof Error ? err.message : "Failed to leave room.");
    }
  }

  async function handleDelete() {
    setShowMenu(false);
    if (!confirm("Delete this room? All messages will be deleted for everyone.")) return;
    try {
      removedRef.current = true;
      await deleteRoom(room_id);
      router.push("/rooms");
    } catch (err) {
      removedRef.current = false;
      setError(err instanceof Error ? err.message : "Failed to delete room.");
    }
  }

  if (error && !room) {
    return (
      <div className="min-h-dvh bg-neutral-950 flex flex-col items-center justify-center px-4 gap-4">
        <p className="text-red-400 text-sm">{error}</p>
        <button
          onClick={() => router.push("/rooms")}
          className="text-sm text-violet-400 hover:text-violet-300 transition"
        >
          Back to rooms
        </button>
      </div>
    );
  }

  if (!room || !user) {
    return (
      <div className="min-h-dvh bg-neutral-950 flex items-center justify-center">
        <span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isOwner = room.owner_id === user.id;
  const otherMembers = room.members.filter((m) => m.id !== user.id);
  const memberById = new Map(room.members.map((m) => [m.id, m]));
  const typingEntries = Object.entries(typingUsers);
  const typingNames = typingEntries.map(([, pseudo]) => pseudo);

  function senderOf(msg: Pick<ChatMessage, "sender_id" | "sender_pseudo">) {
    return memberById.get(msg.sender_id) ?? { id: msg.sender_id, pseudo: msg.sender_pseudo, avatar_id: null };
  }

  function seenBy(msg: ChatMessage): Member[] {
    const sent = new Date(msg.sent_at).getTime();
    return otherMembers.filter((m) => new Date(m.last_read_at).getTime() >= sent);
  }

  const lastOwnSent = messages.findLast((m) => m.sender_id === user.id && !m.status);
  const lastOwnSeenBy = lastOwnSent ? seenBy(lastOwnSent) : [];

  return (
    <div
      className="relative h-dvh bg-neutral-950 flex flex-col"
      onDragEnter={handleDragEnter}
      onDragOver={(e) => dragging && e.preventDefault()}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-800 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push("/rooms")}
            className="text-neutral-500 hover:text-neutral-300 transition flex-shrink-0"
            aria-label="Back to rooms"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => !removed && setShowMembers(true)}
            className="flex items-center gap-2.5 min-w-0 text-left"
          >
            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600/20 text-violet-300 flex items-center justify-center text-sm font-semibold uppercase">
              {room.name.charAt(0)}
            </span>
            <span className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-neutral-200 leading-tight truncate">{room.name}</span>
              {typingNames.length > 0 && connState === "open" ? (
                <span className="text-[11px] text-violet-400 leading-tight truncate">
                  {typingLabel(typingNames)}
                </span>
              ) : (
                <span className="text-[11px] text-neutral-500 leading-tight truncate">
                  {room.members.length === 1 ? "Just you" : `${room.members.length} members`}
                </span>
              )}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {connState === "open" && (
            <span className="flex items-center gap-1.5 text-xs text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="hidden sm:inline">Connected</span>
            </span>
          )}
          {connState === "connecting" && (
            <span className="text-xs text-neutral-500">Connecting…</span>
          )}
          {connState === "closed" && !removed && (
            <span className="flex items-center gap-1.5 text-xs text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
              Disconnected
            </span>
          )}

          {!removed && (
            <div className="relative">
              <button
                onClick={() => setShowMenu((v) => !v)}
                className="text-neutral-500 hover:text-neutral-300 transition p-1"
                aria-label="Room menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01" />
                </svg>
              </button>
              {showMenu && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-neutral-900 border border-neutral-800 rounded-xl shadow-lg z-40 overflow-hidden">
                  <button
                    onClick={() => {
                      setShowMembers(true);
                      setShowMenu(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800 transition"
                  >
                    Members & invites
                  </button>
                  {isOwner && (
                    <button
                      onClick={() => {
                        setRenameValue(room.name);
                        setShowRename(true);
                        setShowMenu(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800 transition"
                    >
                      Rename room
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowMenu(false);
                      handleLeave();
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm text-neutral-300 hover:bg-neutral-800 transition"
                  >
                    Leave room
                  </button>
                  {isOwner && (
                    <button
                      onClick={handleDelete}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-400 hover:bg-neutral-800 transition"
                    >
                      Delete room
                    </button>
                  )}
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
              placeholder="Room name…"
              autoFocus
              onFocus={(e) => e.target.select()}
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

      {error && (
        <div className="flex items-center justify-between gap-3 border-b border-red-900/50 bg-red-900/20 px-4 py-2 text-xs text-red-300 flex-shrink-0">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200" aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        onClick={() => setShowMenu(false)}
        className="flex-1 overflow-y-auto px-4 py-4"
        style={{ scrollBehavior: "auto" }}
      >
        {hasMore && (
          <div className="flex justify-center pb-3">
            <button
              onClick={loadOlder}
              disabled={loadingOlder}
              className="text-xs text-neutral-500 hover:text-neutral-300 transition disabled:opacity-60"
            >
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}

        {messages.length === 0 && !removed && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            {otherMembers.length === 0 ? (
              <>
                <p className="text-sm text-neutral-500">It&apos;s just you in here for now.</p>
                <button
                  onClick={() => setShowMembers(true)}
                  className="px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition"
                >
                  Invite people
                </button>
              </>
            ) : (
              <p className="text-sm text-neutral-600">No messages yet. Say hi 👋</p>
            )}
          </div>
        )}

        {messages.map((msg, i) => {
          const prev = messages[i - 1];
          const isOwn = msg.sender_id === user.id;
          const newDay = !prev || !sameDay(prev.sent_at, msg.sent_at);
          const showSender = !isOwn && (newDay || prev.sender_id !== msg.sender_id);
          const confirmed = !msg.status;
          const seen = isOwn && confirmed ? seenBy(msg) : [];
          const seenByAll = otherMembers.length > 0 && seen.length === otherMembers.length;
          const reactionGroups = groupReactions(msg.reactions, user.id);
          const hasAttachments = msg.attachments.length > 0;

          return (
            <div key={msg.client_id ?? msg.id}>
              {newDay && (
                <div className="flex items-center gap-3 my-4">
                  <span className="flex-1 h-px bg-neutral-800" />
                  <span className="text-[11px] font-medium text-neutral-500">{formatDay(msg.sent_at)}</span>
                  <span className="flex-1 h-px bg-neutral-800" />
                </div>
              )}

              <div className={`group flex ${isOwn ? "justify-end" : "justify-start"} ${showSender || newDay ? "mt-3" : "mt-1"}`}>
                {!isOwn && (
                  <div className="w-7 mr-2 flex-shrink-0">
                    {showSender && <Avatar user={senderOf(msg)} size={28} />}
                  </div>
                )}
                <div className={`relative max-w-[75%] flex flex-col ${isOwn ? "items-end" : "items-start"}`}>
                  {showSender && (
                    <span className={`text-[11px] font-medium mb-0.5 ml-1 ${nameColor(msg.sender_id)}`}>
                      {msg.sender_pseudo}
                    </span>
                  )}
                  <div className="relative">
                    <div
                      className={`rounded-2xl text-sm break-words select-none touch-manipulation ${
                        hasAttachments ? "p-1" : "px-4 py-2"
                      } ${
                        isOwn
                          ? `bg-violet-600 text-white rounded-br-md ${msg.status === "failed" ? "opacity-60" : ""}`
                          : "bg-neutral-800 text-neutral-100 rounded-bl-md"
                      }`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        pointerTypeRef.current = e.pointerType;
                        if (!confirmed) return;
                        holdFiredRef.current = false;
                        holdTimerRef.current = setTimeout(() => {
                          holdTimerRef.current = null;
                          holdFiredRef.current = true;
                          lastTapRef.current = null;
                          setContextMsg(msg);
                        }, 400);
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation();
                        if (!confirmed) return;
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
                      onPointerLeave={cancelHold}
                      onPointerCancel={cancelHold}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        // touch long-press is handled by the hold timer overlay
                        if (!confirmed || pointerTypeRef.current === "touch") return;
                        togglePicker(msg.id, e.currentTarget);
                      }}
                    >
                      {hasAttachments && (
                        <AttachmentGrid attachments={msg.attachments} onOpen={(i) => openLightbox(msg, i)} />
                      )}
                      {msg.content && (
                        <p className={`whitespace-pre-wrap ${hasAttachments ? "px-3 pt-1.5" : ""}`}>{msg.content}</p>
                      )}
                      <div
                        className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : ""} ${
                          hasAttachments ? "px-3 pb-1" : ""
                        }`}
                      >
                        <span className={`text-[10px] ${isOwn ? "text-violet-300" : "text-neutral-500"}`}>
                          {formatTime(msg.sent_at)}
                        </span>
                        {isOwn && confirmed && (
                          <svg
                            className={`w-3.5 h-3.5 ${seenByAll ? "text-violet-200" : "text-violet-400/60"}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            {seenByAll ? (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M1 12l5 5L17 6M7 12l5 5L23 6" />
                            ) : (
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12l5 5L20 7" />
                            )}
                          </svg>
                        )}
                        {msg.status === "pending" && (
                          <svg className="w-3 h-3 text-violet-300/70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="12" r="9" strokeWidth={2} />
                            <path strokeLinecap="round" strokeWidth={2} d="M12 7v5l3 2" />
                          </svg>
                        )}
                      </div>
                    </div>

                    {confirmed && (
                      <button
                        type="button"
                        data-reaction-picker
                        onClick={(e) => togglePicker(msg.id, e.currentTarget)}
                        title="Add reaction (or double-click the message for ❤️)"
                        aria-label="Add reaction"
                        className={`hidden pointer-fine:flex absolute top-1/2 -translate-y-1/2 ${
                          isOwn ? "right-full mr-1.5" : "left-full ml-1.5"
                        } w-7 h-7 items-center justify-center rounded-full text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800 transition focus-visible:opacity-100 ${
                          picker?.id === msg.id ? "opacity-100 text-neutral-200 bg-neutral-800" : "opacity-0 group-hover:opacity-100"
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="9" strokeWidth={2} />
                          <path strokeLinecap="round" strokeWidth={2} d="M8.5 14.5s1.25 1.5 3.5 1.5 3.5-1.5 3.5-1.5M9 9.5h.01M15 9.5h.01" />
                        </svg>
                      </button>
                    )}

                    {picker?.id === msg.id && (
                      <div
                        data-reaction-picker
                        className={`absolute z-30 ${picker.below ? "top-full mt-1.5" : "bottom-full mb-1.5"} ${
                          isOwn ? "right-0" : "left-0"
                        }`}
                      >
                        <ReactionBar
                          selected={msg.reactions.find((r) => r.user_id === user.id)?.emoji}
                          onPick={(emoji) => handleReact(msg.id, emoji)}
                          compact
                        />
                      </div>
                    )}
                  </div>

                  {msg.status === "failed" && (
                    <button
                      onClick={() => handleRetry(msg)}
                      className="mt-1 text-[11px] text-red-400 hover:text-red-300 transition"
                    >
                      Not sent · tap to retry
                    </button>
                  )}

                  {reactionGroups.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {reactionGroups.map((g) => (
                        <button
                          key={g.emoji}
                          onClick={() => handleReact(msg.id, g.emoji)}
                          title={g.userIds.map((id) => (id === user.id ? "You" : memberById.get(id)?.pseudo ?? "Former member")).join(", ")}
                          className={`flex items-center gap-1 text-sm leading-none rounded-full px-2 py-0.5 border transition ${
                            g.mine
                              ? "bg-violet-600/20 border-violet-500/40 hover:bg-red-900/30 hover:border-red-500/40"
                              : "bg-neutral-800 border-neutral-700 hover:border-neutral-500"
                          }`}
                        >
                          {g.emoji}
                          {g.userIds.length > 1 && (
                            <span className="text-[11px] text-neutral-300 tabular-nums">{g.userIds.length}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {msg === lastOwnSent && lastOwnSeenBy.length > 0 && (
                    <span className="mt-1 text-[10px] text-neutral-500">
                      {seenByAll && otherMembers.length > 1
                        ? "Seen by everyone"
                        : `Seen by ${lastOwnSeenBy.map((m) => m.pseudo).join(", ")}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {typingEntries.length > 0 && connState === "open" && (
          <div className="flex mt-3">
            <div className="w-7 mr-2 flex-shrink-0">
              <Avatar user={senderOf({ sender_id: typingEntries[0][0], sender_pseudo: typingEntries[0][1] })} size={28} />
            </div>
            <div className="flex flex-col items-start">
              <span className="text-[11px] font-medium mb-0.5 ml-1">
                {typingEntries.map(([id, pseudo], i) => (
                  <Fragment key={id}>
                    {i > 0 && <span className="text-neutral-500">, </span>}
                    <span className={nameColor(id)}>{pseudo}</span>
                  </Fragment>
                ))}
                <span className="text-neutral-500">
                  {typingEntries.length === 1 ? " is typing" : " are typing"}
                </span>
              </span>
              <div className="bg-neutral-800 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-neutral-500 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {removed ? (
        <div className="border-t border-neutral-800 px-4 py-5 text-center flex-shrink-0">
          <p className="text-sm text-neutral-400 mb-3">
            This room was deleted or you&apos;re no longer a member.
          </p>
          <button
            onClick={() => router.push("/rooms")}
            className="px-5 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-xl transition"
          >
            Back to rooms
          </button>
        </div>
      ) : (
        <form onSubmit={handleSend} className="border-t border-neutral-800 flex-shrink-0">
          <PendingUploads uploads={composer.uploads} onRemove={composer.remove} />
          <div className="px-4 py-3 flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_IMAGE_TYPES.join(",")}
              multiple
              hidden
              onChange={(e) => {
                composer.addFiles(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 rounded-xl p-2.5 transition"
              aria-label="Add images"
              title="Add images (or paste / drop them)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="16" rx="2.5" strokeWidth={2} />
                <circle cx="8.5" cy="9.5" r="1.5" strokeWidth={2} />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15l-5-5L5 20" />
              </svg>
            </button>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onPaste={handlePaste}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={connState === "open" ? "Type a message…" : "Waiting for connection…"}
              disabled={connState !== "open"}
              maxLength={2000}
              autoFocus
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={connState !== "open" || composer.blocked || (!input.trim() && composer.ready === 0)}
              className="bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl p-2.5 transition"
              aria-label="Send"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </form>
      )}

      {lightbox && (
        <Lightbox attachments={lightbox.items} index={lightbox.index} onClose={() => setLightbox(null)} />
      )}

      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-40 m-3 flex items-center justify-center rounded-2xl border-2 border-dashed border-violet-500 bg-neutral-950/80">
          <p className="text-sm font-medium text-violet-300">Drop images to send</p>
        </div>
      )}

      {showMembers && (
        <MembersPanel
          room={room}
          currentUserId={user.id}
          refreshKey={roomVersion}
          onClose={() => setShowMembers(false)}
          onRemove={handleRemoveMember}
          onLeave={handleLeave}
        />
      )}

      {/* Long-press reaction overlay */}
      {contextMsg && (() => {
        const isOwn = contextMsg.sender_id === user.id;
        const myReaction = contextMsg.reactions.find((r) => r.user_id === user.id);
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
              {!isOwn && (
                <p className={`text-[11px] font-medium mb-0.5 ${nameColor(contextMsg.sender_id)}`}>
                  {contextMsg.sender_pseudo}
                </p>
              )}
              <p className="whitespace-pre-wrap">
                {contextMsg.content ||
                  (contextMsg.attachments.length > 1 ? `📷 ${contextMsg.attachments.length} photos` : "📷 Photo")}
              </p>
              <div className={`flex items-center gap-1 mt-1 ${isOwn ? "justify-end" : ""}`}>
                <span className={`text-[10px] ${isOwn ? "text-violet-300" : "text-neutral-500"}`}>
                  {formatTime(contextMsg.sent_at)}
                </span>
              </div>
            </div>

            {/* Emoji strip */}
            <div onClick={(e) => e.stopPropagation()}>
              <ReactionBar
                selected={myReaction?.emoji}
                onPick={(emoji) => handleReact(contextMsg.id, emoji)}
              />
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function ReactionBar({
  selected,
  onPick,
  compact = false,
}: {
  selected?: string;
  onPick: (emoji: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-center bg-neutral-900 border border-neutral-700 rounded-full shadow-2xl ${
        compact ? "gap-0.5 px-1.5 py-1" : "gap-2 px-3 py-2"
      }`}
    >
      {EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          className={`leading-none flex items-center justify-center rounded-full transition hover:scale-125 active:scale-110 ${
            compact ? "text-xl w-9 h-9 hover:bg-neutral-800" : "text-2xl w-10 h-10"
          } ${selected === emoji ? "bg-violet-600/30 ring-2 ring-violet-500 scale-110" : ""}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}

/** Groups a message's reactions by emoji, in first-reacted order. */
function groupReactions(reactions: Reaction[], currentUserId: string) {
  const groups: { emoji: string; userIds: string[]; mine: boolean }[] = [];
  for (const r of reactions) {
    let g = groups.find((x) => x.emoji === r.emoji);
    if (!g) {
      g = { emoji: r.emoji, userIds: [], mine: false };
      groups.push(g);
    }
    g.userIds.push(r.user_id);
    if (r.user_id === currentUserId) g.mine = true;
  }
  return groups;
}
