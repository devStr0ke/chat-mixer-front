# Chat Mixer — Frontend

Chat Mixer is an anonymous, ephemeral real-time chat app. Users register with a pseudo and a country, then get matched with a random stranger for a 24-hour conversation window. Each conversation is isolated —> no history is kept after expiry.

**Features:**
- Anonymous matchmaking (worldwide or same-country)
- Real-time messaging over WebSocket (JSON protocol)
- Typing indicators and read receipts
- Room rename and delete
- Instant unread badge updates via a global notification WebSocket
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
NEXT_PUBLIC_API_URL=http://localhost:8080

# Optional — only needed for LAN testing between two devices on the same network.
# When set, all WebSocket connections (chat + notifications) will use this host instead
# of the host extracted from NEXT_PUBLIC_API_URL.
# Format: host:port (no protocol prefix)
# NEXT_PUBLIC_WS_HOST=192.168.1.12:8080
```

> **Note:** After modifying `.env.local`, restart the dev server for changes to take effect.

---

## Getting Started

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Build for Production

```bash
pnpm build
pnpm start
```
