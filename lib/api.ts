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

  // FormData bodies need the browser to set the multipart boundary itself
  const mergedHeaders: Record<string, string> = {
    ...(rest.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
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
  country2: string | null;
  avatar_id: string | null;
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
  country2?: string;
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
  country2: string | null;
  avatar_id: string | null;
}

export function searchUsers(q: string) {
  return apiFetch<UserSummary[]>(`/users/search?q=${encodeURIComponent(q)}`);
}

export function getMe() {
  return apiFetch<User>("/users/me");
}

export function updateProfile(country: string, country2: string | null) {
  return apiFetch<User>("/users/me", {
    method: "PATCH",
    body: JSON.stringify({ country, country2 }),
  });
}

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export function uploadAvatar(file: Blob, filename: string) {
  const form = new FormData();
  form.append("file", file, filename);
  return apiFetch<User>("/users/me/avatar", { method: "PUT", body: form });
}

export function deleteAvatar() {
  return apiFetch<User>("/users/me/avatar", { method: "DELETE" });
}

/** Same-origin URL, so the browser sends the auth cookie with <img> requests. */
export function avatarUrl(avatarId: string) {
  return `${HTTP_BASE}/avatars/${avatarId}`;
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
  attachment_count: number;
  has_gif: boolean;
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

/** A room's custom look. Null fields use the app's defaults. */
export interface RoomTheme {
  background_color: string | null;
  background_image_id: string | null;
  bubble_own_color: string | null;
  bubble_other_color: string | null;
}

export type RoomThemeColors = Omit<RoomTheme, "background_image_id">;

export interface RoomDetail extends Room {
  theme: RoomTheme;
  members: Member[];
}

export interface Reaction {
  user_id: string;
  emoji: string;
}

export interface Attachment {
  id: string;
  content_type: string;
  width: number;
  height: number;
  size: number;
}

/** A GIF from the GIF library, as attached to a message. */
export interface MessageGif {
  id: string;
  url: string;
  width: number;
  height: number;
}

/** A GIF search result: the message rendition plus a smaller one for the picker grid. */
export interface Gif extends MessageGif {
  title: string;
  preview_url: string;
  preview_width: number;
  preview_height: number;
}

export interface GifPage {
  gifs: Gif[];
  next_offset: number | null;
}

export function searchGifs(q: string, offset = 0) {
  return apiFetch<GifPage>(`/gifs/search?q=${encodeURIComponent(q)}&offset=${offset}`);
}

export function trendingGifs(offset = 0) {
  return apiFetch<GifPage>(`/gifs/trending?offset=${offset}`);
}

export interface Message {
  id: string;
  sender_id: string;
  sender_pseudo: string;
  content: string;
  sent_at: string;
  reactions: Reaction[];
  attachments: Attachment[];
  gif: MessageGif | null;
  reply_to: ReplyPreview | null;
}

/** The quoted message shown inside a reply (its text is truncated by the server). */
export interface ReplyPreview {
  id: string;
  sender_id: string;
  sender_pseudo: string;
  content: string;
  attachment_count: number;
  has_gif: boolean;
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

export function updateRoomTheme(roomId: string, colors: RoomThemeColors) {
  return apiFetch<RoomTheme>(`/rooms/${roomId}/theme`, {
    method: "PATCH",
    body: JSON.stringify(colors),
  });
}

export function uploadRoomBackground(roomId: string, file: Blob, filename: string) {
  const form = new FormData();
  form.append("file", file, filename);
  return apiFetch<RoomTheme>(`/rooms/${roomId}/background`, { method: "PUT", body: form });
}

export function deleteRoomBackground(roomId: string) {
  return apiFetch<RoomTheme>(`/rooms/${roomId}/background`, { method: "DELETE" });
}

/** Same-origin URL, so the auth cookie goes along when CSS loads it. */
export function roomBackgroundUrl(roomId: string, imageId: string) {
  return `${HTTP_BASE}/rooms/${roomId}/background/${imageId}`;
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

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export function uploadAttachment(roomId: string, file: Blob, filename: string) {
  const form = new FormData();
  form.append("file", file, filename);
  return apiFetch<Attachment>(`/rooms/${roomId}/attachments`, {
    method: "POST",
    body: form,
  });
}

/** Same-origin URL, so the browser sends the auth cookie with <img> requests. */
export function attachmentUrl(attachmentId: string) {
  return `${HTTP_BASE}/attachments/${attachmentId}`;
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
  | {
      type: "message";
      content: string;
      client_id: string;
      attachment_ids?: string[];
      gif_id?: string;
      reply_to_id?: string;
    }
  | { type: "typing" }
  | { type: "read"; id: string };

export type WsIncoming =
  | {
      type: "message";
      id: string;
      room_id: string;
      sender_id: string;
      sender_pseudo: string;
      content?: string;
      sent_at: string;
      attachments?: Attachment[];
      gif?: MessageGif;
      reply_to?: ReplyPreview;
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
      content?: string;
      sent_at: string;
      attachments?: Attachment[];
      gif?: MessageGif;
      reply_to?: ReplyPreview;
    }
  | { type: "invitation"; room_id: string }
  | { type: "room_removed"; room_id: string }
  | { type: "room_read"; room_id: string }
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
