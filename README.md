# Chat Mixer — Frontend

Chat Mixer is a real-time group chat app. Users register with a pseudo and a country, create rooms, invite people by pseudo, and chat. Rooms are persistent — there's no expiry.

**Features:**
- Profile page: profile picture (center-cropped to a square in the browser) and an optional second country flag
- Create rooms and invite people with a pseudo search
- Accept or decline invitations, delivered live
- Real-time messaging over WebSocket (JSON protocol) with paginated history
- Send photos, videos and GIFs: button, paste or drag-and-drop. Photos are resized to 2048px and stripped of EXIF (GPS) in the browser; GIFs stay animated
- Videos (MP4, MOV, WebM, up to 100 MB) upload with a progress indicator and can be cancelled; the browser grabs a poster frame and the duration, and they play in a full-screen player
- Typing indicators showing who is typing, and "seen by" read receipts
- Emoji picker (native emojis, with search, recently used and skin tones) in the message box
- GIF library: search GIPHY and send with one click (requires `GIPHY_API_KEY` on the backend)
- Links are clickable and shown in a short form, with a preview card (site, title, description, image) when the page provides one
- Replies: quote a message (swipe it right on mobile, hover button on desktop); tap the quote to jump to the original
- Edit your own messages (long-press menu, hover button, or ↑ in an empty message box); an "Edited" label opens the full edit history
- Room appearance (any member): presets, background color or image, bubble colors, with text contrast picked automatically
- Built-in camera (the round button left of the message box), like Snapchat: selfies come out exactly as you saw them (mirrored) instead of flipped like the phone's camera app, with the camera's whole frame (no crop or zoom); switch cameras with the button or a double-tap, and send straight away, optionally as view once. Needs HTTPS and camera permission; falls back to the photo library
- View-once photos and videos: toggle "View once" before sending; each person can open it once (full screen, no saving), and you see who opened it and when
- Instagram-style touch: long-press a message to lift it with reactions above and Reply / Copy / Edit below; double-tap for ❤️; swipe the conversation left to see message times. Text isn't selectable in the chat on phones, so a long-press never opens the browser's copy menu
- Emoji reactions: a pill on the message's corner opens who reacted (and lets you remove yours); on desktop, hover or right-click a message, double-click for ❤️, "+" for any emoji
- Messages from the same person are grouped, with a timestamp after each pause; photos, videos and emoji-only messages show without a bubble
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
# Base URL of the Chat Mixer backend. API calls go through the app's /api rewrite
# to it; photo/video uploads go to it directly (Next.js caps proxied bodies at
# 10 MB), so this app's origin must be in the backend's CORS_ORIGINS.
# Also the WebSocket host fallback.
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
