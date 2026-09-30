"use client";

import { attachmentUrl, type Attachment } from "@/lib/api";

/** An attachment as shown locally; optimistic sends carry a blob preview. */
export type DisplayAttachment = Attachment & { preview_url?: string };

const SINGLE_MAX_WIDTH = 280;
const SINGLE_MAX_HEIGHT = 360;
const SINGLE_MIN_SIZE = 48;
const GRID_WIDTH = 276;
const GRID_GAP = 2;

export function attachmentSrc(a: DisplayAttachment): string {
  return a.preview_url ?? attachmentUrl(a.id);
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
  return (
    <button
      type="button"
      onClick={onOpen}
      style={style}
      className={`block w-full overflow-hidden bg-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 ${className}`}
      aria-label="Open image"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin images */}
      <img
        src={attachmentSrc(attachment)}
        alt=""
        referrerPolicy="no-referrer"
        loading="lazy"
        decoding="async"
        draggable={false}
        className="w-full h-full object-cover [-webkit-touch-callout:none]"
      />
    </button>
  );
}

/**
 * Images inside a message bubble. Boxes are sized from the stored dimensions
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
