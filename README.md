# Chat Mixer — Frontend

Chat Mixer is a real-time group chat app. Users register with a pseudo and a country, create rooms, invite people by pseudo, and chat. Rooms are persistent — there's no expiry.

**Features:**
- Create rooms and invite people with a pseudo search
- Accept or decline invitations, delivered live
- Real-time messaging over WebSocket (JSON protocol) with paginated history
- Typing indicators, "seen by" read receipts and emoji reactions
- Members panel: invite, cancel pending invitations, remove members (owner), leave
- Rename and delete rooms (owner)
- Live unread badges and message previews via a global notification WebSocket
- JWT authentication with automatic expiry handling

---

## Requirements

- [Node.js](https://nodejs.org) 20+
- [pnpm](https://pnpm.io)
- The [Chat Mixer backend](https://github.com/devStr0ke/chat-mixer) running

---

## Environment Variables

Create a `.env.local` file at the root of the project:

```bash
# Base URL of the Chat Mixer backend (used for HTTP API calls and WS host fallback)
NEXT_PUBLIC_API_URL=http://localhost:8090

# Optional — only needed for LAN testing between two devices on the same network.
# When set, all WebSocket connections (chat + notifications) will use this host instead
# of the host extracted from NEXT_PUBLIC_API_URL.
# Format: host:port (no protocol prefix)
# NEXT_PUBLIC_WS_HOST=192.168.1.12:8090
```

> **Note:** After modifying `.env.local`, restart the dev server for changes to take effect.

---

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. If port 3000 is taken, use `pnpm dev --port 3001`.

---

## Build for Production

```bash
pnpm build
pnpm start
```
