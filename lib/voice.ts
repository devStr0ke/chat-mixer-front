/**
 * Voice messages, as on Instagram: recorded from the microphone with the
 * browser's own encoder, with the loudness sampled as it goes for the
 * waveform drawn in the bubble.
 */

export type VoiceRecording = { blob: Blob; durationMs: number; waveform: number[] };

export const MAX_VOICE_MS = 60_000;
/** shorter than this is a slip of the finger, not a message */
export const MIN_VOICE_MS = 700;
/** bars in a voice message's waveform */
export const WAVEFORM_BARS = 40;
const SAMPLE_MS = 50;

// AAC in MP4 first: it plays everywhere, iPhones included; Opus otherwise
const RECORDING_TYPES = [
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/ogg;codecs=opus",
  "audio/webm",
];

export const canRecordVoice = () =>
  typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

function micError(err: unknown): Error {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return new Error("Microphone access was denied. Allow it in your browser's settings to send voice messages.");
  if (name === "NotFoundError") return new Error("No microphone was found on this device.");
  return new Error("The microphone couldn't be started.");
}

/** Loudness of one stretch of sound, 0 (silence) to 1, on a decibel scale like the ear's. */
function level(samples: Float32Array<ArrayBuffer>): number {
  let sum = 0;
  for (const v of samples) sum += v * v;
  const rms = Math.sqrt(sum / samples.length);
  const db = 20 * Math.log10(rms || 1e-6);
  return Math.min(1, Math.max(0, (db + 55) / 45));
}

/** The loudness samples squeezed into WAVEFORM_BARS bars, 6–100 (silence stays visible). */
function toWaveform(samples: number[]): number[] {
  if (samples.length === 0) return Array(WAVEFORM_BARS).fill(6);
  const bars: number[] = [];
  for (let i = 0; i < WAVEFORM_BARS; i++) {
    const from = Math.floor((i * samples.length) / WAVEFORM_BARS);
    const to = Math.max(from + 1, Math.floor(((i + 1) * samples.length) / WAVEFORM_BARS));
    bars.push(Math.max(...samples.slice(from, to)));
  }
  const peak = Math.max(...bars, 0.05);
  return bars.map((b) => Math.round(Math.max(0.06, b / peak) * 100));
}

/** One recording: start(), then finish() to keep it or cancel() to drop it. */
export class VoiceSession {
  private readonly context: AudioContext | null;
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private analyser: AnalyserNode | null = null;
  private buffer: Float32Array<ArrayBuffer> | null = null;
  private chunks: Blob[] = [];
  private samples: number[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private limit: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;
  private done = false;
  /** called when the recording reaches MAX_VOICE_MS */
  onLimit: (() => void) | null = null;

  constructor() {
    // made (and resumed) right in the tap: phones only allow sound then
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
      void context.resume();
    } catch {
      /* the waveform is flat without it; the recording still works */
    }
    this.context = context;
  }

  async start(): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      this.cleanUp();
      throw micError(err);
    }
    if (this.done) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;

    if (!this.startRecorder(RECORDING_TYPES.filter((t) => MediaRecorder.isTypeSupported(t)))) {
      this.cleanUp();
      throw new Error("This browser can't record voice messages.");
    }

    if (this.context) {
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 1024;
      this.context.createMediaStreamSource(stream).connect(analyser);
      this.analyser = analyser;
      this.buffer = new Float32Array(analyser.fftSize);
    }
    this.timer = setInterval(() => {
      if (this.analyser && this.buffer) {
        this.analyser.getFloatTimeDomainData(this.buffer);
        this.samples.push(level(this.buffer));
      } else {
        this.samples.push(0);
      }
    }, SAMPLE_MS);
    this.limit = setTimeout(() => this.onLimit?.(), MAX_VOICE_MS);

    this.startedAt = performance.now();
  }

  /**
   * Records with the first type that works. Some browsers say they can encode
   * a type, then fail as soon as they start: the next one is tried then.
   */
  private startRecorder(types: (string | undefined)[]): boolean {
    const stream = this.stream;
    if (!stream) return false;
    // with no type at all, the browser picks its own
    const [mimeType, ...rest] = types.length ? types : [undefined];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { ...(mimeType && { mimeType }), audioBitsPerSecond: 64_000 });
    } catch {
      return rest.length > 0 && this.startRecorder(rest);
    }
    recorder.ondataavailable = (e) => {
      if (e.data.size && this.recorder === recorder) this.chunks.push(e.data);
    };
    recorder.onerror = () => {
      if (this.recorder !== recorder || this.done || this.chunks.length > 0) return;
      if (!(rest.length > 0 && this.startRecorder(rest))) this.recorder = null;
    };
    this.recorder = recorder;
    recorder.start(250);
    return true;
  }

  /** Recording (the microphone is on), as opposed to still waiting for it. */
  get recording(): boolean {
    return this.startedAt > 0 && !this.done;
  }

  get elapsedMs(): number {
    return this.startedAt ? Math.min(MAX_VOICE_MS, performance.now() - this.startedAt) : 0;
  }

  /** The latest loudness samples (0–1), newest last, for the live waveform. */
  recent(count: number): number[] {
    return this.samples.slice(-count);
  }

  /** Stops and returns the recording, or null when there's nothing usable. */
  async finish(): Promise<VoiceRecording | null> {
    if (this.done) return null;
    const recorder = this.recorder;
    const durationMs = this.elapsedMs;
    const samples = this.samples;
    this.done = true;
    if (!recorder || recorder.state === "inactive") {
      this.cleanUp();
      return null;
    }
    const stopped = new Promise<void>((resolve) => recorder.addEventListener("stop", () => resolve(), { once: true }));
    recorder.stop();
    await stopped;
    this.cleanUp();
    const type = (recorder.mimeType || "audio/webm").split(";")[0];
    const blob = new Blob(this.chunks, { type });
    if (!blob.size) return null;
    return { blob, durationMs, waveform: toWaveform(samples) };
  }

  cancel() {
    this.done = true;
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.cleanUp();
  }

  private cleanUp() {
    this.done = true;
    if (this.timer) clearInterval(this.timer);
    if (this.limit) clearTimeout(this.limit);
    this.timer = this.limit = null;
    // the microphone light goes off right away
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.context?.close().catch(() => {});
  }
}

/** File name for a recording, from its type: "voice.m4a", "voice.webm"… */
export function voiceFileName(type: string): string {
  if (type.includes("mp4")) return "voice.m4a";
  if (type.includes("ogg")) return "voice.ogg";
  return "voice.webm";
}
