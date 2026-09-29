const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const HTTP_BASE = "/api";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

type RequestOptions = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
  skipAuth?: boolean;
};

export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { skipAuth = false, headers = {}, ...rest } = options;

  const mergedHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };

  if (!skipAuth) {
    const token = getToken();
    if (token) {
      mergedHeaders["Authorization"] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${HTTP_BASE}${path}`, {
    ...rest,
    headers: mergedHeaders,
  });

  if (!res.ok) {
    let errorMessage = `Request failed with status ${res.status}`;
    try {
      const errorBody = await res.json();
      if (errorBody.error) {
        errorMessage = errorBody.error;
      }
    } catch {
      // ignore JSON parse errors on error responses
    }
    const err = new Error(errorMessage) as Error & { status: number };
    err.status = res.status;
    throw err;
  }

  const contentType = res.headers.get("content-type");
  if (res.status === 204) {
    return {} as T;
  }
  if (!contentType || !contentType.includes("application/json")) {
    throw new Error("Unexpected response from server.");
  }

  return res.json() as Promise<T>;
}

export interface User {
  id: string;
  pseudo: string;
  email: string;
  country: string;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface RegisterPayload {
  pseudo: string;
  email: string;
  country: string;
  password: string;
}

export interface LoginPayload {
  identifier: string;
  password: string;
}

export function register(payload: RegisterPayload) {
  return apiFetch<AuthResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
    skipAuth: true,
  });
}

export function login(payload: LoginPayload) {
  return apiFetch<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
    skipAuth: true,
  });
}

export interface UserSummary {
  id: string;
  pseudo: string;
  country: string;
}

export function searchUsers(q: string) {
  return apiFetch<UserSummary[]>(`/users/search?q=${encodeURIComponent(q)}`);
}

export interface Room {
  id: string;
  name: string;
  owner_id: string;
  created_at: string;
}

export interface LastMessage {
  id: string;
  sender_id: string;
  sender_pseudo: string;
  content: string;
  sent_at: string;
}

export interface RoomSummary extends Room {
  member_count: number;
  unread_count: number;
  last_message: LastMessage | null;
}

export interface Member extends UserSummary {
  joined_at: string;
  last_read_at: string;
}

export interface RoomDetail extends Room {
  members: Member[];
}

export interface Reaction {
  user_id: string;
  emoji: string;
}

export interface Message {
  id: string;
  sender_id: string;
  sender_pseudo: string;
  content: string;
  sent_at: string;
  reactions: Reaction[];
}

export interface MessagePage {
  messages: Message[];
  has_more: boolean;
}

export interface Invitation {
  id: string;
  room_id: string;
  room_name: string;
  inviter: UserSummary;
  invitee: UserSummary;
  created_at: string;
}

export function createRoom(name: string, pseudos: string[] = []) {
  return apiFetch<Room>("/rooms", {
    method: "POST",
    body: JSON.stringify({ name, pseudos }),
  });
}

export function getMyRooms() {
  return apiFetch<RoomSummary[]>("/rooms/me");
}

export function getRoom(roomId: string) {
  return apiFetch<RoomDetail>(`/rooms/${roomId}`);
}

export function getRoomMessages(roomId: string, before?: string) {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  return apiFetch<MessagePage>(`/rooms/${roomId}/messages${query}`);
}

export function renameRoom(roomId: string, name: string) {
  return apiFetch<{ message: string }>(`/rooms/${roomId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteRoom(roomId: string) {
  return apiFetch<{ message: string }>(`/rooms/${roomId}`, {
    method: "DELETE",
  });
}

/** Removes a member; pass your own id to leave the room. */
export function removeMember(roomId: string, userId: string) {
  return apiFetch<{ message: string }>(`/rooms/${roomId}/members/${userId}`, {
    method: "DELETE",
  });
}

export function getRoomInvitations(roomId: string) {
  return apiFetch<Invitation[]>(`/rooms/${roomId}/invitations`);
}

export function inviteToRoom(roomId: string, pseudo: string) {
  return apiFetch<Invitation>(`/rooms/${roomId}/invitations`, {
    method: "POST",
    body: JSON.stringify({ pseudo }),
  });
}

export function getMyInvitations() {
  return apiFetch<Invitation[]>("/invitations");
}

export function acceptInvitation(invitationId: string) {
  return apiFetch<{ room_id: string }>(`/invitations/${invitationId}/accept`, {
    method: "POST",
  });
}

/** Declines (as invitee) or cancels (as inviter or room owner) an invitation. */
export function deleteInvitation(invitationId: string) {
  return apiFetch<{ message: string }>(`/invitations/${invitationId}`, {
    method: "DELETE",
  });
}

export function addReaction(messageId: string, emoji: string) {
  return apiFetch<{ message: string }>(`/messages/${messageId}/reactions`, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  });
}

export function removeReaction(messageId: string) {
  return apiFetch<{ message: string }>(`/messages/${messageId}/reactions`, {
    method: "DELETE",
  });
}

export type WsOutgoing =
  | { type: "message"; content: string; client_id: string }
  | { type: "typing" }
  | { type: "read"; id: string };

export type WsIncoming =
  | {
      type: "message";
      id: string;
      room_id: string;
      sender_id: string;
      sender_pseudo: string;
      content: string;
      sent_at: string;
    }
  | { type: "message_ack"; id: string; client_id: string; sent_at: string }
  | { type: "message_error"; client_id: string }
  | { type: "typing"; user_id: string; pseudo: string }
  | { type: "read"; user_id: string; read_at: string }
  | { type: "reaction"; message_id: string; user_id: string; action: "add"; emoji: string }
  | { type: "reaction"; message_id: string; user_id: string; action: "remove" }
  | { type: "member_joined"; room_id: string; user_id: string }
  | { type: "member_left"; room_id: string; user_id: string }
  | { type: "room_updated"; room_id: string };

export type WsNotification =
  | {
      type: "new_message";
      id: string;
      room_id: string;
      sender_id: string;
      sender_pseudo: string;
      content: string;
      sent_at: string;
    }
  | { type: "invitation"; room_id: string }
  | { type: "room_removed"; room_id: string }
  | { type: "online_count"; count: number };

export function createChatWebSocket(roomId: string): WebSocket {
  const token = getToken();
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const wsHost = process.env.NEXT_PUBLIC_WS_HOST ?? BASE_URL.replace(/^https?:\/\//, "");
  return new WebSocket(`${protocol}://${wsHost}/ws/${roomId}?token=${token ?? ""}`);
}

export function createNotificationWebSocket(): WebSocket {
  const token = getToken();
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const wsHost = process.env.NEXT_PUBLIC_WS_HOST ?? BASE_URL.replace(/^https?:\/\//, "");
  return new WebSocket(`${protocol}://${wsHost}/ws/notifications?token=${token ?? ""}`);
}
