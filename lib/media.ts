import { ACCEPTED_VIDEO_TYPES } from "./api";
import { canvasToBlob } from "./images";

const VIDEO_EXTENSIONS = /\.(mp4|m4v|mov|webm)$/i;
const POSTER_MAX_DIMENSION = 960;
const POSTER_QUALITY = 0.8;
const PROBE_TIMEOUT = 10_000;

export function isVideo(attachment: { content_type: string }): boolean {
  return attachment.content_type.startsWith("video/");
}

/** Some browsers leave the type empty (or use x-m4v), so the extension counts too; the server checks the bytes. */
export function isVideoFile(file: File): boolean {
  return ACCEPTED_VIDEO_TYPES.includes(file.type) || VIDEO_EXTENSIONS.test(file.name);
}

/** "0:07", "12:30", "1:02:03" */
export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** One-line stand-in for a message without text: "📷 Photo", "🎬 2 videos", "GIF"… */
export function mediaSummary(count: number, videos: number, hasGif: boolean): string {
  if (hasGif) return "GIF";
  const photos = count - videos;
  if (videos === 0) return photos > 1 ? `📷 ${photos} photos` : photos === 1 ? "📷 Photo" : "";
  if (photos === 0) return videos > 1 ? `🎬 ${videos} videos` : "🎬 Video";
  return `📷 ${count} photos & videos`;
}

function waitFor(video: HTMLVideoElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error("timed out")), PROBE_TIMEOUT);
    const onEvent = () => done();
    const onError = () => done(new Error("cannot decode video"));
    function done(err?: Error) {
      clearTimeout(timer);
      video.removeEventListener(event, onEvent);
      video.removeEventListener("error", onError);
      if (err) reject(err);
      else resolve();
    }
    video.addEventListener(event, onEvent);
    video.addEventListener("error", onError);
  });
}

async function captureFrame(video: HTMLVideoElement): Promise<Blob | null> {
  const { videoWidth: w, videoHeight: h } = video;
  if (!w || !h) return null;
  const scale = Math.min(1, POSTER_MAX_DIMENSION / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
  const webp = await canvasToBlob(canvas, "image/webp", POSTER_QUALITY);
  if (webp?.type === "image/webp") return webp;
  return canvasToBlob(canvas, "image/jpeg", POSTER_QUALITY);
}

/**
 * Reads a video's length and grabs an early frame as its poster (the poster
 * also tells the server the video's shape). A video this browser can't decode
 * is still sent, just without a poster or duration.
 */
export async function prepareVideo(file: File): Promise<{ poster: Blob | null; durationMs: number }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await waitFor(video, "loadedmetadata");
    // recordings from MediaRecorder report an Infinity duration
    const durationMs = Number.isFinite(video.duration) ? video.duration * 1000 : 0;
    let poster: Blob | null = null;
    try {
      // half a second in, past the black frame many clips start with
      const seeked = waitFor(video, "seeked");
      video.currentTime = durationMs ? Math.min(0.5, video.duration / 2) : 0.5;
      await seeked;
      poster = await captureFrame(video);
    } catch {
      // no poster: the video still plays
    }
    return { poster, durationMs };
  } catch {
    return { poster: null, durationMs: 0 };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
