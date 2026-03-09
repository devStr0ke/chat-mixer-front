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

export interface JoinPoolResponse {
  message?: string;
  room_id?: string;
}

export function joinPool(sameCountry = false) {
  return apiFetch<JoinPoolResponse>("/pool/join", {
    method: "POST",
    body: JSON.stringify({ same_country: sameCountry }),
  });
}

export function leavePool() {
  return apiFetch<{ message: string }>("/pool/leave", {
    method: "POST",
  });
}

export interface Room {
  id: string;
  country_a: string;
  country_b: string;
  user_a_room_name: string;
  user_b_room_name: string;
  created_at: string;
  expires_at: string;
  is_active: boolean;
}

export interface Message {
  id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  sent_at: string;
}

export function getRoom(roomId: string) {
  return apiFetch<Room>(`/rooms/${roomId}`);
}

export function getMyRooms() {
  return apiFetch<Room[]>("/rooms/me");
}

export function getRoomMessages(roomId: string) {
  return apiFetch<Message[]>(`/rooms/${roomId}/messages`);
}

export function renameRoom(roomId: string, name: string) {
  return apiFetch<{ message: string }>(`/rooms/${roomId}/name`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteRoom(roomId: string) {
  return apiFetch<{ message: string }>(`/rooms/${roomId}`, {
    method: "DELETE",
  });
}

export type WsOutgoing =
  | { type: "message"; content: string }
  | { type: "typing" }
  | { type: "read"; id: string };

export type WsIncoming =
  | { type: "message"; id: string; content: string }
  | { type: "message_ack"; id: string }
  | { type: "typing" }
  | { type: "read"; id: string };

export type WsNotification =
  | { type: "new_message"; room_id: string; id: string }
  | { type: "room_closed"; room_id: string };

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
