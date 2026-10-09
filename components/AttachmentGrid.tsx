"use client";

import { attachmentPosterUrl, attachmentUrl, type Attachment } from "@/lib/api";
import { formatDuration, isVideo } from "@/lib/media";

/** An attachment as shown locally; optimistic sends carry blob previews of the file (and video poster). */
export type DisplayAttachment = Attachment & { preview_url?: string; poster_preview_url?: string };

const SINGLE_MAX_WIDTH = 280;
const SINGLE_MAX_HEIGHT = 360;
const SINGLE_MIN_SIZE = 48;
const GRID_WIDTH = 276;
const GRID_GAP = 2;

export function attachmentSrc(a: DisplayAttachment): string {
  return a.preview_url ?? attachmentUrl(a.id);
}

/** A video's still frame, if it has one. */
export function posterSrc(a: DisplayAttachment): string | undefined {
  return a.poster_preview_url ?? (a.has_poster ? attachmentPosterUrl(a.id) : undefined);
}

export function PlayIcon({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center justify-center rounded-full bg-black/55 backdrop-blur-sm ${className}`}>
      <svg className="w-1/2 h-1/2 translate-x-[8%] text-white" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z" />
      </svg>
    </span>
  );
}

function Thumb({
  attachment,
  className = "",
  style,
  onOpen,
}: {
  attachment: DisplayAttachment;
  className?: string;
  style?: React.CSSProperties;
  onOpen: () => void;
}) {
  const video = isVideo(attachment);
  const still = video ? posterSrc(attachment) : attachmentSrc(attachment);
  return (
    <button
      type="button"
      onClick={onOpen}
      style={style}
      className={`relative block w-full overflow-hidden bg-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${className}`}
      aria-label={video ? "Play video" : "Open image"}
    >
      {still ? (
        // eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin images
        <img
          src={still}
          alt=""
          referrerPolicy="no-referrer"
          loading="lazy"
          decoding="async"
          draggable={false}
          className="w-full h-full object-cover [-webkit-touch-callout:none]"
        />
      ) : (
        // no poster (the sender's browser couldn't read the video): let this browser show a frame
        <video
          src={`${attachmentSrc(attachment)}#t=0.5`}
          preload="metadata"
          muted
          playsInline
          className="w-full h-full object-cover pointer-events-none [-webkit-touch-callout:none]"
        />
      )}
      {video && (
        <>
          <span className="absolute inset-0 flex items-center justify-center">
            <PlayIcon className="w-11 h-11" />
          </span>
          {!!attachment.duration_ms && (
            <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
              {formatDuration(attachment.duration_ms)}
            </span>
          )}
        </>
      )}
    </button>
  );
}

/**
 * Photos and videos inside a message bubble. Boxes are sized from the stored dimensions
 * (so the conversation doesn't jump while images load) and shrink with the
 * bubble on narrow screens.
 */
export function AttachmentGrid({
  attachments,
  onOpen,
}: {
  attachments: DisplayAttachment[];
  onOpen: (index: number) => void;
}) {
  if (attachments.length === 1) {
    const a = attachments[0];
    const scale = Math.min(1, SINGLE_MAX_WIDTH / a.width, SINGLE_MAX_HEIGHT / a.height);
    const width = Math.max(SINGLE_MIN_SIZE, Math.round(a.width * scale));
    const height = Math.max(SINGLE_MIN_SIZE, Math.round(a.height * scale));
    return (
      <div className="max-w-full rounded-xl overflow-hidden" style={{ width }}>
        <Thumb attachment={a} style={{ aspectRatio: `${width} / ${height}` }} onOpen={() => onOpen(0)} />
      </div>
    );
  }

  const oddLast = attachments.length % 2 === 1;
  return (
    <div className="grid grid-cols-2 max-w-full rounded-xl overflow-hidden" style={{ width: GRID_WIDTH, gap: GRID_GAP }}>
      {attachments.map((a, i) => {
        const spans = oddLast && i === attachments.length - 1;
        return (
          <Thumb
            key={a.id}
            attachment={a}
            className={spans ? "col-span-2 aspect-[2/1]" : "aspect-square"}
            onOpen={() => onOpen(i)}
          />
        );
      })}
    </div>
  );
}
