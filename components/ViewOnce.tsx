"use client";

import { useEffect, useState } from "react";
import { attachmentOverlayUrl, attachmentUrl, fetchAttachmentBlob, type Attachment, type MessageOpen } from "@/lib/api";
import { formatStamp } from "@/lib/format";
import { isVideo } from "@/lib/media";
import { Avatar } from "./Avatar";
import { Sheet } from "./Sheet";

type Person = { id: string; pseudo: string; avatar_id: string | null };

/** Instagram's view-once mark: a "1" in a circle, dashed once it's been opened. */
export function ViewOnceIcon({ className = "", used = false }: { className?: string; used?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="9" strokeWidth={2} strokeDasharray={used ? "3 3" : undefined} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.5 9.5 12.5 8v8" />
    </svg>
  );
}

export type ViewOnceState = "ready" | "opened" | "expired" | "sent";

/** What a view-once message shows in the conversation: never the photo itself. */
export function ViewOnceBubble({
  kind,
  state,
  onOpen,
}: {
  kind: "Photo" | "Video";
  state: ViewOnceState;
  onOpen: () => void;
}) {
  const used = state === "opened" || state === "expired";
  const label = state === "opened" ? "Opened" : state === "expired" ? "Expired" : kind;
  const body = (
    <>
      <ViewOnceIcon className="w-5 h-5 flex-shrink-0" used={used} />
      <span className={state === "ready" ? "font-semibold" : ""}>{label}</span>
    </>
  );
  return state === "ready" ? (
    <button type="button" onClick={onOpen} className="flex items-center gap-2" aria-label={`Open view-once ${kind.toLowerCase()}`}>
      {body}
    </button>
  ) : (
    <span className={`flex items-center gap-2 ${used ? "opacity-60" : ""}`}>{body}</span>
  );
}

/**
 * Full-screen view of a view-once photo or video. A photo is fetched once into
 * memory; a video plays once and closes. Leaving the app closes it too. A web
 * page can't stop screenshots, but there's no download link, saving by
 * long-press or drag, or reopening.
 */
export function ViewOnceViewer({
  attachment,
  sender,
  sentAt,
  onClose,
}: {
  attachment: Attachment;
  sender: Person;
  sentAt: string;
  onClose: () => void;
}) {
  const video = isVideo(attachment);
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (video) return;
    let url: string | null = null;
    let cancelled = false;
    fetchAttachmentBlob(attachment.id)
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [attachment.id, video]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onHide = () => document.visibilityState === "hidden" && onClose();
    document.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black select-none [-webkit-touch-callout:none] [animation:fade-in_150ms_both]"
      onContextMenu={(e) => e.preventDefault()}
      role="dialog"
      aria-modal="true"
      aria-label="View-once message"
    >
      {video && (
        <div className="absolute inset-x-3 top-[max(0.5rem,env(safe-area-inset-top))] h-0.5 rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
      <div className="absolute inset-x-0 top-0 flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 bg-gradient-to-b from-black/70 to-transparent">
        <Avatar user={sender} size={32} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{sender.pseudo}</p>
          <p className="text-[11px] text-neutral-300">{formatStamp(sentAt)}</p>
        </div>
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-white/90 hover:bg-white/10" aria-label="Close">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {error ? (
        <p className="text-sm text-neutral-300">{error}</p>
      ) : video ? (
        <div className="relative">
          <video
            src={attachmentUrl(attachment.id)}
            autoPlay
            playsInline
            disablePictureInPicture
            disableRemotePlayback
            controlsList="nodownload noplaybackrate noremoteplayback"
            onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || 1))}
            onEnded={onClose}
            onError={() => setError("Couldn't play it.")}
            onClick={(e) => (e.currentTarget.paused ? e.currentTarget.play() : e.currentTarget.pause())}
            className="block max-h-dvh max-w-[100vw]"
          />
          {attachment.has_overlay && (
            // eslint-disable-next-line @next/next/no-img-element -- the text and drawings, exactly the video's size
            <img
              src={attachmentOverlayUrl(attachment.id)}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
          )}
        </div>
      ) : src ? (
        // eslint-disable-next-line @next/next/no-img-element -- in-memory copy of the photo
        <img src={src} alt="" draggable={false} className="pointer-events-none max-h-full max-w-full object-contain" />
      ) : (
        <span className="w-8 h-8 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
      )}

      <p className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 text-xs text-neutral-300 bg-gradient-to-t from-black/70 to-transparent">
        <ViewOnceIcon className="w-4 h-4" />
        {video ? "View once: it closes when the video ends" : "View once: it's gone when you close it"}
      </p>
    </div>
  );
}

/** Who opened one of your view-once messages, and when. */
export function OpenersSheet({
  opens,
  personOf,
  onClose,
}: {
  opens: MessageOpen[];
  personOf: (userId: string) => Person;
  onClose: () => void;
}) {
  return (
    <Sheet title="Opened by" onClose={onClose}>
      <ul>
        {opens.map((o) => {
          const person = personOf(o.user_id);
          return (
            <li key={o.user_id} className="flex items-center gap-3 px-5 py-2.5">
              <Avatar user={person} size={40} />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-neutral-100">{person.pseudo}</span>
              <span className="text-xs text-neutral-500">{formatStamp(o.opened_at)}</span>
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}
