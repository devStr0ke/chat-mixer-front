# Chat Mixer — Frontend

Chat Mixer is a real-time group chat app. Users register with a pseudo and a country, create rooms, invite people by pseudo, and chat. Rooms are persistent — there's no expiry.

**Features:**
- Profile page: profile picture (center-cropped to a square in the browser) and an optional second country flag
- Create rooms and invite people with a pseudo search
- Accept or decline invitations, delivered live
- Real-time messaging over WebSocket (JSON protocol) with paginated history
- Multi-line messages: on a computer Enter sends and Shift+Enter starts a new line; on a phone the return key starts a new line and the Send button sends. The box grows up to about five lines. On phones there's no emoji button (the keyboard has emojis) and the other buttons step aside while you type; while typing, the camera button becomes a search that opens stickers matching the text (picking one sends it and clears the text)
- Send photos, videos and GIFs: button, paste or drag-and-drop. Photos are resized to 2048px and stripped of EXIF (GPS) in the browser; GIFs stay animated
- Videos (MP4, MOV, WebM, up to 100 MB) upload with a progress indicator and can be cancelled; the browser grabs a poster frame and the duration, and they play in a full-screen player
- Typing indicators showing who is typing, and "seen by" read receipts
- Emoji picker (native emojis, with search, recently used and skin tones) in the message box
- GIFs and stickers: one button opens GIPHY search with GIFs and Stickers tabs; stickers show without a bubble (requires `GIPHY_API_KEY` on the backend)
- Draw: the pen button opens a drawing layer over the conversation (pen, neon, eraser, colors, sizes, undo); the drawing is sent with a transparent background and shown across the conversation where it was drawn (scaled down on narrower screens)
- Make your own stickers: in the Stickers tab, "Create" opens a photo; move and zoom it, cut it out as a circle, a rounded square or freehand (draw around what to keep), with an optional white border. Saved stickers stay in "My stickers" (Edit to remove them)
- Delete your own messages for everyone (long-press menu or the hover trash button): the room sees "This message was deleted"
- Links are clickable and shown in a short form, with a preview card (site, title, description, image) when the page provides one
- YouTube (videos and Shorts), TikTok and Instagram (reels and posts) links play inside the app: tapping the link or its card (which shows a play button) opens the site's own embedded player full screen, and closing it stops the video. Short share links (`vm.tiktok.com/…`, `instagram.com/share/…`) are resolved by the API first. Nothing is loaded from those sites until a link is tapped; private posts, and some reels Instagram or TikTok won't embed, show "Open in …" instead. TikTok starts muted (its player refuses otherwise) and may ask about its cookies inside the player
- Replies: quote a message (swipe it right on mobile, hover button on desktop); tap the quote to jump to the original
- Edit your own messages (long-press menu, hover button, or ↑ in an empty message box); an "Edited" label opens the full edit history
- Room appearance (any member): presets, background color or image, bubble colors, with text contrast picked automatically
- Built-in camera (the round button left of the message box), like Snapchat: tap the shutter for a photo, hold it to film a video (up to 60 s, with sound when the microphone is allowed); while holding, slide the finger up to zoom in and back down to zoom out (the camera's own zoom where the browser allows it, like Chrome on Android; otherwise a digital zoom up to 4×). Selfies, photos and videos alike, come out exactly as you saw them (mirrored) instead of flipped like the phone's camera app, with the camera's whole frame (no crop or zoom); switch cameras with the button or a double-tap, even while filming. Before sending, write on it like on Snapchat (tap the picture: a caption bar, or big coloured text with the T; drag it to move it) and draw on it with the pen (9 colours, undo). Photos get it painted in; videos keep it as a see-through layer the size of the video, shown on top while it plays, so sending stays instant. Everything sent from the camera is view once; only photos and videos picked from the gallery can stay in the chat. Needs HTTPS and camera permission; falls back to the photo library
- View-once photos and videos: always for the camera, and a "View once" toggle for gallery picks; each person can open it once (full screen, no saving), and you see who opened it and when
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
