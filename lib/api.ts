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
  /** how many of the attachments are videos */
  video_count: number;
  has_gif: boolean;
  /** the GIF is a GIPHY sticker, or it's a custom sticker */
  sticker: boolean;
  /** a drawing made in the chat */
  drawing: boolean;
  view_once: boolean;
  /** deleted by its sender */
  deleted: boolean;
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

/** An uploaded photo or video. A video's width/height are those of its poster frame. */
export interface Attachment {
  id: string;
  content_type: string;
  width: number;
  height: number;
  size: number;
  /** videos: length, when the uploader's browser could read it */
  duration_ms?: number;
  /** videos: whether a poster frame was uploaded with it */
  has_poster?: boolean;
  /** camera videos: text and drawings shown on top (see attachmentOverlayUrl) */
  has_overlay?: boolean;
}

/** A GIF (or sticker) from the GIF library, as attached to a message. */
export interface MessageGif {
  id: string;
  url: string;
  width: number;
  height: number;
  /** a transparent GIPHY sticker, shown without a bubble */
  sticker?: boolean;
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

export type GifKind = "gifs" | "stickers";

/** A sticker someone made from a photo in the app's sticker maker, or a drawing. */
export interface MessageSticker {
  id: string;
  width: number;
  height: number;
  /** "drawing": drawn in the chat (not part of anyone's sticker collection) */
  kind?: "drawing";
}

/** Your own stickers, newest first. */
export function listMyStickers() {
  return apiFetch<MessageSticker[]>("/stickers");
}

/** `display` (drawings): the size it was drawn at on screen, which is the size it's shown at. */
export function createSticker(
  image: Blob,
  kind: "sticker" | "drawing" = "sticker",
  display?: { width: number; height: number }
) {
  const form = new FormData();
  form.append("file", image, image.type === "image/webp" ? "sticker.webp" : "sticker.png");
  if (display) {
    form.append("display_width", String(Math.round(display.width)));
    form.append("display_height", String(Math.round(display.height)));
  }
  return apiFetch<MessageSticker>(`/stickers?kind=${kind}`, { method: "POST", body: form });
}

/** Removes a sticker from your collection (messages already sent keep it). */
export function deleteSticker(id: string) {
  return apiFetch<Record<string, never>>(`/stickers/${id}`, { method: "DELETE" });
}

/** Same-origin, so the auth cookie goes along with <img> requests. */
export function stickerImageUrl(id: string) {
  return `${HTTP_BASE}/stickers/${id}/image`;
}

export function searchGifs(q: string, offset = 0, kind: GifKind = "gifs") {
  return apiFetch<GifPage>(`/gifs/search?q=${encodeURIComponent(q)}&offset=${offset}&kind=${kind}`);
}

export function trendingGifs(offset = 0, kind: GifKind = "gifs") {
  return apiFetch<GifPage>(`/gifs/trending?offset=${offset}&kind=${kind}`);
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
  /** set once the sender has edited the text */
  edited_at: string | null;
  /** a photo or video each member can open once */
  view_once?: boolean;
  /** view-once: who opened it so far (missing until someone does) */
  opens?: MessageOpen[];
  /** view-once: the file is gone (everyone opened it, or 14 days passed) */
  expired?: boolean;
  /** deleted by its sender: everything else is empty */
  deleted?: boolean;
  /** a custom sticker (made in the app) */
  sticker?: MessageSticker;
}

export interface MessageOpen {
  user_id: string;
  opened_at: string;
}

/** Deletes your own message for everyone; it then shows as "This message was deleted". */
export function deleteMessage(messageId: string) {
  return apiFetch<Record<string, never>>(`/messages/${messageId}`, { method: "DELETE" });
}

/** Opens a view-once message (once). The file can then be fetched for `expires_in` seconds. */
export function openViewOnce(messageId: string) {
  return apiFetch<{ attachment: Attachment; expires_in: number }>(`/messages/${messageId}/open`, { method: "POST" });
}

/** One version of a message's text and when it was written. */
export interface MessageVersion {
  content: string;
  at: string;
}

export function editMessage(messageId: string, content: string) {
  return apiFetch<{ id: string; content: string; edited_at: string | null }>(`/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
}

/** Every version of a message, oldest first; the last one is the current text. */
export function getMessageEdits(messageId: string) {
  return apiFetch<{ versions: MessageVersion[] }>(`/messages/${messageId}/edits`);
}

/** The quoted message shown inside a reply (its text is truncated by the server). */
export interface ReplyPreview {
  id: string;
  sender_id: string;
  sender_pseudo: string;
  content: string;
  attachment_count: number;
  /** how many of the attachments are videos */
  video_count: number;
  has_gif: boolean;
  sticker: boolean;
  drawing: boolean;
  view_once: boolean;
  /** the quoted message was deleted by its sender */
  deleted: boolean;
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

/** What a linked page says about itself, as fetched by our server. */
export interface LinkPreview {
  url: string;
  title: string;
  description: string;
  site_name: string;
  image_id: string | null;
  image_width: number;
  image_height: number;
}

const linkPreviewCache = new Map<string, Promise<LinkPreview | null>>();

/** Preview card data for a URL, or null when the page has none. Deduplicated per session. */
export function getLinkPreview(url: string): Promise<LinkPreview | null> {
  let pending = linkPreviewCache.get(url);
  if (!pending) {
    pending = apiFetch<LinkPreview>(`/link-preview?url=${encodeURIComponent(url)}`).catch((err) => {
      // "no preview" is a final answer; anything else (rate limit, network) may work later
      if ((err as { status?: number }).status !== 404) linkPreviewCache.delete(url);
      return null;
    });
    linkPreviewCache.set(url, pending);
  }
  return pending;
}

const videoLinkCache = new Map<string, Promise<string | null>>();

/** The full address behind a short TikTok or Instagram share link, or null. */
export function resolveVideoLink(url: string): Promise<string | null> {
  let pending = videoLinkCache.get(url);
  if (!pending) {
    pending = apiFetch<{ url: string }>(`/link-embed?url=${encodeURIComponent(url)}`)
      .then((r) => r.url)
      .catch(() => {
        videoLinkCache.delete(url);
        return null;
      });
    videoLinkCache.set(url, pending);
  }
  return pending;
}

/** Our own copy of the page's preview image (same-origin, so the auth cookie goes along). */
export function linkPreviewImageUrl(imageId: string) {
  return `${HTTP_BASE}/link-previews/images/${imageId}`;
}

export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
/** MP4, iPhone MOV and WebM, played as they are (no re-encoding) */
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export type UploadOptions = {
  /** videos: an early frame, used as the thumbnail */
  poster?: Blob | null;
  /** videos: length in milliseconds */
  durationMs?: number;
  /** camera videos: the text and drawings, a see-through image the video's size */
  overlay?: Blob | null;
  /** called with the fraction (0–1) of the body sent so far */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

/**
 * Uploads a photo or video. Uses XMLHttpRequest rather than fetch because
 * fetch can't report upload progress, which matters for videos. It goes
 * straight to the API (CORS) instead of through the /api rewrite, which caps
 * request bodies at 10 MB.
 */
export function uploadAttachment(
  roomId: string,
  file: Blob,
  filename: string,
  { poster, durationMs, overlay, onProgress, signal }: UploadOptions = {}
): Promise<Attachment> {
  const form = new FormData();
  form.append("file", file, filename);
  if (poster) form.append("poster", poster, "poster");
  if (overlay) form.append("overlay", overlay, "overlay");
  if (durationMs) form.append("duration_ms", String(Math.round(durationMs)));

  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Upload cancelled.", "AbortError"));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE_URL}/rooms/${roomId}/attachments`);
    xhr.responseType = "json";
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300 && xhr.response) {
        resolve(xhr.response as Attachment);
        return;
      }
      const message = (xhr.response as { error?: string } | null)?.error;
      const err = new Error(message ?? `Upload failed (status ${xhr.status}).`) as Error & { status: number };
      err.status = xhr.status;
      reject(err);
    };
    xhr.onerror = () => reject(new Error("Upload failed: network error."));
    xhr.onabort = () => reject(new DOMException("Upload cancelled.", "AbortError"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });
}

/** Same-origin URL, so the browser sends the auth cookie with <img> and <video> requests. */
export function attachmentUrl(attachmentId: string) {
  return `${HTTP_BASE}/attachments/${attachmentId}`;
}

/** Downloads an attachment into memory (a view-once photo is fetched once, then shown from there). */
export async function fetchAttachmentBlob(attachmentId: string): Promise<Blob> {
  const token = getToken();
  const res = await fetch(attachmentUrl(attachmentId), {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(res.status === 410 ? "This has expired." : "Couldn't load it.");
  return res.blob();
}

/** The text and drawings laid over a camera video (only when the attachment has_overlay). */
export function attachmentOverlayUrl(attachmentId: string) {
  return `${HTTP_BASE}/attachments/${attachmentId}/overlay`;
}

/** A video's poster frame (only when the attachment has_poster). */
export function attachmentPosterUrl(attachmentId: string) {
  return `${HTTP_BASE}/attachments/${attachmentId}/poster`;
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
      view_once?: boolean;
      sticker_id?: string;
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
      view_once?: boolean;
      sticker?: MessageSticker;
    }
  | { type: "message_edited"; id: string; room_id: string; content: string; edited_at: string }
  | { type: "message_opened"; id: string; user_id: string; opened_at: string }
  | { type: "message_deleted"; id: string; room_id: string }
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
      view_once?: boolean;
      sticker?: MessageSticker;
    }
  | { type: "message_edited"; id: string; room_id: string; content: string; edited_at: string }
  | { type: "message_deleted"; id: string; room_id: string }
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
