"use client";

import { useState } from "react";
import { EmojiPicker } from "frimousse";
import { loadRecentEmojis, loadSkinTone, rememberEmoji, saveSkinTone } from "@/lib/emojiPrefs";

const COLUMNS = 8;

const emojiButton =
  "flex size-9 items-center justify-center rounded-lg text-xl leading-none hover:bg-neutral-800 transition-colors";

/**
 * Searchable picker of the device's native emojis (emojis the device can't
 * render are left out). The dataset is served from /emojibase.
 */
export function EmojiPickerPanel({
  onSelect,
  autoFocusSearch = false,
}: {
  onSelect: (emoji: string) => void;
  autoFocusSearch?: boolean;
}) {
  const [recent, setRecent] = useState(loadRecentEmojis);
  const [initialSkinTone] = useState(loadSkinTone);

  function pick(emoji: string) {
    setRecent(rememberEmoji(emoji));
    onSelect(emoji);
  }

  return (
    <EmojiPicker.Root
      onEmojiSelect={({ emoji }) => pick(emoji)}
      emojibaseUrl="/emojibase"
      columns={COLUMNS}
      skinTone={initialSkinTone}
      className="isolate flex h-[380px] w-fit flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 shadow-2xl"
    >
      <EmojiPicker.Search
        placeholder="Search emoji…"
        autoFocus={autoFocusSearch}
        className="mx-2 mt-2 appearance-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-500"
      />

      {recent.length > 0 && (
        <div className="border-b border-neutral-800 px-1.5 pb-1.5 pt-2">
          <p className="px-1.5 pb-1 text-xs font-medium text-neutral-500">Recently used</p>
          <div className="flex">
            {recent.slice(0, COLUMNS).map((emoji) => (
              <button key={emoji} type="button" onClick={() => pick(emoji)} className={emojiButton}>
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <EmojiPicker.Viewport className="relative flex-1 outline-none">
        <EmojiPicker.Loading className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
          Loading…
        </EmojiPicker.Loading>
        <EmojiPicker.Empty className="absolute inset-0 flex items-center justify-center text-sm text-neutral-500">
          No emoji found.
        </EmojiPicker.Empty>
        <EmojiPicker.List
          className="select-none pb-1.5"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div className="bg-neutral-900 px-3 pb-1.5 pt-3 text-xs font-medium text-neutral-500" {...props}>
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div className="scroll-my-1.5 px-1.5" {...props}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button
                type="button"
                className="flex size-9 items-center justify-center rounded-lg text-xl leading-none data-[active]:bg-neutral-800"
                {...props}
              >
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </EmojiPicker.Viewport>

      <div className="flex items-center gap-2 border-t border-neutral-800 px-3 py-2">
        <EmojiPicker.ActiveEmoji>
          {({ emoji }) => (
            <p className="flex min-w-0 flex-1 items-center gap-2 text-xs text-neutral-400">
              {emoji ? (
                <>
                  <span className="text-lg leading-none">{emoji.emoji}</span>
                  <span className="truncate">{emoji.label}</span>
                </>
              ) : (
                <span className="text-neutral-600">Pick an emoji…</span>
              )}
            </p>
          )}
        </EmojiPicker.ActiveEmoji>

        <EmojiPicker.SkinTone>
          {({ skinTone, setSkinTone, skinToneVariations }) => {
            const index = skinToneVariations.findIndex((v) => v.skinTone === skinTone);
            const next = skinToneVariations[(index + 1) % skinToneVariations.length];
            return (
              <button
                type="button"
                onClick={() => {
                  setSkinTone(next.skinTone);
                  saveSkinTone(next.skinTone);
                }}
                title="Change skin tone"
                aria-label="Change skin tone"
                className={emojiButton}
              >
                {skinToneVariations[Math.max(index, 0)].emoji}
              </button>
            );
          }}
        </EmojiPicker.SkinTone>
      </div>
    </EmojiPicker.Root>
  );
}
