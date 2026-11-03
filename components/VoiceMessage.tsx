"use client";

import { useEffect, useRef, useState } from "react";
import { attachmentUrl, type Attachment } from "@/lib/api";
import { formatDuration } from "@/lib/media";
import { type VoiceSession, MAX_VOICE_MS, WAVEFORM_BARS } from "@/lib/voice";

// one voice message plays at a time, as on Instagram
let playing: HTMLAudioElement | null = null;

/** Bars for a message sent without a waveform: a gentle pattern, the same each time. */
function placeholderBars(seed: string): number[] {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return Array.from({ length: WAVEFORM_BARS }, (_, i) => {
    h = (h * 1103515245 + 12345) >>> 0;
    return 25 + ((h >>> 16) % 50) * Math.sin((Math.PI * (i + 1)) / (WAVEFORM_BARS + 1));
  });
}

function PlayIcon({ paused }: { paused: boolean }) {
  return paused ? (
    <svg className="ml-0.5 h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path d="M7 5.2v13.6a1 1 0 001.5.86l11.2-6.8a1 1 0 000-1.72L8.5 4.34A1 1 0 007 5.2z" />
    </svg>
  ) : (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
      <rect x="6" y="4.5" width="4" height="15" rx="1.2" />
      <rect x="14" y="4.5" width="4" height="15" rx="1.2" />
    </svg>
  );
}

/** A voice message in a bubble: play/pause, the waveform (tap it to jump), the time left. */
export function VoiceMessage({ attachment }: { attachment: Attachment & { preview_url?: string } }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef(0);
  const [paused, setPaused] = useState(true);
  const [progress, setProgress] = useState(0);
  const durationMs = attachment.duration_ms ?? 0;
  const bars = attachment.waveform?.length ? attachment.waveform : placeholderBars(attachment.id);

  useEffect(
    () => () => {
      cancelAnimationFrame(frameRef.current);
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        if (playing === audio) playing = null;
      }
    },
    []
  );

  function audio(): HTMLAudioElement {
    if (audioRef.current) return audioRef.current;
    const el = new Audio(attachment.preview_url ?? attachmentUrl(attachment.id));
    el.preload = "auto";
    const tick = () => {
      const total = el.duration && Number.isFinite(el.duration) ? el.duration : durationMs / 1000;
      if (total) setProgress(Math.min(1, el.currentTime / total));
      frameRef.current = requestAnimationFrame(tick);
    };
    el.addEventListener("play", () => {
      setPaused(false);
      cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(tick);
    });
    el.addEventListener("pause", () => {
      setPaused(true);
      cancelAnimationFrame(frameRef.current);
    });
    el.addEventListener("ended", () => {
      setPaused(true);
      setProgress(0);
      cancelAnimationFrame(frameRef.current);
      if (playing === el) playing = null;
    });
    audioRef.current = el;
    return el;
  }

  function play(from?: number) {
    const el = audio();
    if (playing && playing !== el) playing.pause();
    playing = el;
    if (from !== undefined) {
      const total = el.duration && Number.isFinite(el.duration) ? el.duration : durationMs / 1000;
      el.currentTime = from * total;
      setProgress(from);
    }
    el.play().catch(() => setPaused(true));
  }

  function toggle() {
    const el = audioRef.current;
    if (el && !el.paused) el.pause();
    else play();
  }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    play(Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)));
  }

  const left = paused && progress === 0 ? durationMs : durationMs * (1 - progress);

  return (
    <div className="flex w-[14.5rem] max-w-full items-center gap-2.5 py-0.5" data-own-taps>
      <button
        type="button"
        onClick={toggle}
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition active:scale-90"
        aria-label={paused ? "Play voice message" : "Pause voice message"}
      >
        <PlayIcon paused={paused} />
      </button>
      <div
        // the bars spread over whatever width there is, never under the time
        className="flex h-8 min-w-0 flex-1 cursor-pointer items-center justify-between overflow-hidden"
        onClick={seek}
        role="slider"
        aria-label="Voice message position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
      >
        {bars.map((b, i) => (
          <span
            key={i}
            className={`w-[2.5px] flex-shrink-0 rounded-full bg-current transition-opacity ${
              (i + 0.5) / bars.length <= progress ? "opacity-100" : "opacity-45"
            }`}
            style={{ height: `${Math.max(12, b)}%` }}
          />
        ))}
      </div>
      <span className="w-9 flex-shrink-0 text-right text-xs tabular-nums opacity-90">{formatDuration(left)}</span>
    </div>
  );
}

const LIVE_BARS = 34;

/**
 * The message box while recording: a red dot and the time, the sound as it
 * comes in, and (when the finger is still on the mic) how to cancel.
 */
export function RecordingBar({
  session,
  holding,
  cancelArmed,
  onCancel,
}: {
  session: VoiceSession;
  holding: boolean;
  cancelArmed: boolean;
  onCancel: () => void;
}) {
  const [frame, setFrame] = useState({ elapsed: 0, levels: [] as number[] });

  // about 15 updates a second is plenty for the bars, and keeps the page calm
  useEffect(() => {
    const id = setInterval(() => setFrame({ elapsed: session.elapsedMs, levels: session.recent(LIVE_BARS) }), 66);
    return () => clearInterval(id);
  }, [session]);

  const live = session.recording;
  const levels = [...Array(Math.max(0, LIVE_BARS - frame.levels.length)).fill(0), ...frame.levels];
  const nearLimit = frame.elapsed > MAX_VOICE_MS - 10_000;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 pl-1">
      {holding ? (
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center">
          <span className={`h-2.5 w-2.5 rounded-full bg-red-500 ${live ? "animate-pulse" : "opacity-40"}`} />
        </span>
      ) : (
        <button
          type="button"
          onClick={onCancel}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-red-400 transition hover:bg-red-500/10 active:scale-90"
          aria-label="Delete recording"
          title="Delete recording"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.9} d="M4 7h16M10 11v6M14 11v6M5.5 7l1 12a2 2 0 002 2h7a2 2 0 002-2l1-12M9 7V4.5A1.5 1.5 0 0110.5 3h3A1.5 1.5 0 0115 4.5V7" />
          </svg>
        </button>
      )}
      <span className={`w-10 flex-shrink-0 text-sm tabular-nums ${nearLimit ? "text-amber-300" : "text-neutral-200"}`}>
        {formatDuration(frame.elapsed)}
      </span>
      {holding ? (
        <span
          className={`min-w-0 flex-1 truncate text-center text-sm transition-colors ${
            cancelArmed ? "font-semibold text-red-400" : "text-neutral-400"
          }`}
        >
          {cancelArmed ? "Release to cancel" : live ? "‹ Slide to cancel" : "Starting the microphone…"}
        </span>
      ) : (
        <div className="flex h-8 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden" aria-hidden>
          {levels.map((l, i) => (
            <span
              key={i}
              className="w-[3px] flex-shrink-0 rounded-full bg-violet-400"
              style={{ height: `${Math.max(10, Math.round(l * 100))}%` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
