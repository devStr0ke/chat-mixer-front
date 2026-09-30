"use client";

import { useEffect, useRef, useState } from "react";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_ATTACHMENT_BYTES,
  deleteRoomBackground,
  updateRoomTheme,
  uploadRoomBackground,
  type RoomDetail,
  type RoomTheme,
  type RoomThemeColors,
} from "@/lib/api";
import { prepareImage } from "@/lib/images";
import { DEFAULT_COLORS, THEME_PRESETS, resolveTheme } from "@/lib/theme";

function sameColors(a: RoomThemeColors, b: RoomThemeColors): boolean {
  return (
    a.background_color === b.background_color &&
    a.bubble_own_color === b.bubble_own_color &&
    a.bubble_other_color === b.bubble_other_color
  );
}

function ColorField({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: string | null;
  fallback: string;
  onChange: (value: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value ?? fallback}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="h-9 w-12 flex-shrink-0 cursor-pointer rounded-lg border border-neutral-700 bg-neutral-800 p-1"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-neutral-200">{label}</p>
        <p className="font-mono text-xs text-neutral-500">{value ?? "Default"}</p>
      </div>
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-neutral-500 transition hover:text-neutral-300"
        >
          Reset
        </button>
      )}
    </div>
  );
}

/**
 * Slide-over where the room owner picks the room's look: background color or
 * image and bubble colors. Everyone in the room sees the result.
 */
export function RoomAppearancePanel({
  room,
  onClose,
  onChanged,
}: {
  room: RoomDetail;
  onClose: () => void;
  onChanged: (theme: RoomTheme) => void;
}) {
  const saved: RoomThemeColors = {
    background_color: room.theme.background_color,
    bubble_own_color: room.theme.bubble_own_color,
    bubble_other_color: room.theme.bubble_other_color,
  };
  const [draft, setDraft] = useState<RoomThemeColors>(saved);
  const [saving, setSaving] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const preview = resolveTheme(room.id, { ...draft, background_image_id: room.theme.background_image_id });
  const changed = !sameColors(draft, saved);

  function update(patch: Partial<RoomThemeColors>) {
    setDraft((d) => ({ ...d, ...patch }));
    setStatus(null);
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      onChanged(await updateRoomTheme(room.id, draft));
      setStatus({ ok: true, text: "Saved" });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Failed to save." });
    } finally {
      setSaving(false);
    }
  }

  async function handleImage(file: File | undefined) {
    if (!file) return;
    setStatus(null);
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setStatus({ ok: false, text: "Choose a JPEG, PNG, GIF or WebP image." });
      return;
    }
    setImageBusy(true);
    try {
      const image = await prepareImage(file);
      if (image.size > MAX_ATTACHMENT_BYTES) throw new Error("Image is too large (max 10 MB).");
      onChanged(await uploadRoomBackground(room.id, image, file.name || "background"));
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Failed to upload the image." });
    } finally {
      setImageBusy(false);
    }
  }

  async function handleRemoveImage() {
    setStatus(null);
    setImageBusy(true);
    try {
      onChanged(await deleteRoomBackground(room.id));
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Failed to remove the image." });
    } finally {
      setImageBusy(false);
    }
  }

  const label = "text-xs font-medium uppercase tracking-wider text-neutral-500";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-sm flex-col border-l border-neutral-800 bg-neutral-900 shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-neutral-800 px-5 py-4">
          <h2 className="text-base font-semibold text-white">Appearance</h2>
          <button onClick={onClose} className="p-1 text-neutral-500 transition hover:text-neutral-300" aria-label="Close">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          <section className="space-y-2">
            <p className={label}>Preview</p>
            <div className="space-y-2 rounded-xl border border-neutral-800 p-4" style={preview.container}>
              <div className="flex justify-start">
                <span className="rounded-2xl rounded-bl-md px-4 py-2 text-sm" style={preview.otherBubble}>
                  Hey! How does this look?
                </span>
              </div>
              <div className="flex justify-end">
                <span className="rounded-2xl rounded-br-md px-4 py-2 text-sm" style={preview.ownBubble}>
                  Looks great 🎨
                </span>
              </div>
              <p className="text-center text-[11px]" style={{ color: preview.muted }}>
                Today
              </p>
            </div>
            <p className="text-xs text-neutral-500">Everyone in the room sees this look.</p>
          </section>

          <section className="space-y-2">
            <p className={label}>Themes</p>
            <div className="grid grid-cols-4 gap-2">
              {THEME_PRESETS.map((preset) => {
                const active = sameColors(draft, preset.colors);
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => update(preset.colors)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-2 text-[11px] transition ${
                      active
                        ? "border-violet-500 bg-violet-600/10 text-white"
                        : "border-neutral-800 text-neutral-400 hover:border-neutral-600"
                    }`}
                  >
                    <span
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-700"
                      style={{ backgroundColor: preset.colors.background_color ?? DEFAULT_COLORS.background }}
                    >
                      <span
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: preset.colors.bubble_own_color ?? DEFAULT_COLORS.bubbleOwn }}
                      />
                    </span>
                    {preset.name}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="space-y-3">
            <p className={label}>Background</p>
            <ColorField
              label="Background color"
              value={draft.background_color}
              fallback={DEFAULT_COLORS.background}
              onChange={(v) => update({ background_color: v })}
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED_IMAGE_TYPES.join(",")}
                hidden
                onChange={(e) => {
                  handleImage(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={imageBusy}
                className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-medium text-neutral-200 transition hover:border-neutral-500 disabled:opacity-60"
              >
                {imageBusy ? "Working…" : room.theme.background_image_id ? "Change image" : "Use an image"}
              </button>
              {room.theme.background_image_id && (
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  disabled={imageBusy}
                  className="text-xs text-neutral-500 transition hover:text-red-400 disabled:opacity-60"
                >
                  Remove image
                </button>
              )}
            </div>
            {room.theme.background_image_id && (
              <p className="text-xs text-neutral-500">The image is shown slightly darkened so messages stay readable.</p>
            )}
          </section>

          <section className="space-y-3">
            <p className={label}>Bubbles</p>
            <ColorField
              label="Your own messages"
              value={draft.bubble_own_color}
              fallback={DEFAULT_COLORS.bubbleOwn}
              onChange={(v) => update({ bubble_own_color: v })}
            />
            <ColorField
              label="Other people's messages"
              value={draft.bubble_other_color}
              fallback={DEFAULT_COLORS.bubbleOther}
              onChange={(v) => update({ bubble_other_color: v })}
            />
            <p className="text-xs text-neutral-500">Text color adjusts automatically to stay readable.</p>
          </section>
        </div>

        <footer className="flex items-center gap-3 border-t border-neutral-800 px-5 py-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={!changed || saving}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save colors"}
          </button>
          {status && <span className={`text-xs ${status.ok ? "text-emerald-400" : "text-red-400"}`}>{status.text}</span>}
        </footer>
      </aside>
    </div>
  );
}
