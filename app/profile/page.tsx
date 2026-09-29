"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_AVATAR_BYTES,
  deleteAvatar,
  updateProfile,
  uploadAvatar,
  type User,
} from "@/lib/api";
import { prepareAvatar } from "@/lib/images";
import { useAuthStore } from "@/lib/store";
import { Avatar } from "@/components/Avatar";
import { CountrySelect } from "@/components/CountrySelect";
import { UserFlags } from "@/components/UserFlags";

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-neutral-800">
        <Link href="/rooms" className="text-neutral-500 hover:text-neutral-300 transition" aria-label="Back to rooms">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <span className="text-lg font-bold text-white">Profile</span>
      </header>

      <main className="flex-1 w-full max-w-md mx-auto px-4 py-8 space-y-6">
        {user ? (
          <>
            <AvatarSection user={user} />
            <CountriesForm key={user.id} user={user} />
          </>
        ) : (
          <div className="flex justify-center py-12">
            <span className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </main>
    </div>
  );
}

function AvatarSection({ user }: { user: User }) {
  const setUser = useAuthStore((s) => s.setUser);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("Choose a JPEG, PNG, GIF or WebP image.");
      return;
    }
    setBusy(true);
    try {
      const image = await prepareAvatar(file);
      if (image.size > MAX_AVATAR_BYTES) throw new Error("Image is too large (max 2 MB).");
      setUser(await uploadAvatar(image, file.name || "avatar"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update your picture.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    setError(null);
    setBusy(true);
    try {
      setUser(await deleteAvatar());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove your picture.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 flex items-center gap-5">
      <div className="relative">
        <Avatar user={user} size={88} />
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
            <span className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-3">
        <div>
          <p className="flex items-center gap-2 text-base font-semibold text-white">
            <span className="truncate">{user.pseudo}</span>
            <UserFlags country={user.country} country2={user.country2} width={18} />
          </p>
          <p className="text-xs text-neutral-500 truncate">{user.email}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES.join(",")}
            hidden
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-60 text-white rounded-lg transition"
          >
            {user.avatar_id ? "Change picture" : "Add a picture"}
          </button>
          {user.avatar_id && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="px-3 py-1.5 text-xs font-medium text-neutral-300 hover:text-white border border-neutral-700 hover:border-neutral-500 disabled:opacity-60 rounded-lg transition"
            >
              Remove
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </section>
  );
}

function CountriesForm({ user }: { user: User }) {
  const setUser = useAuthStore((s) => s.setUser);
  const [country, setCountry] = useState(user.country);
  const [country2, setCountry2] = useState(user.country2 ?? "");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const changed = country !== user.country || country2 !== (user.country2 ?? "");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    setSaving(true);
    try {
      setUser(await updateProfile(country, country2 || null));
      setStatus({ ok: true, text: "Saved" });
    } catch (err) {
      setStatus({ ok: false, text: err instanceof Error ? err.message : "Failed to save." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 space-y-5">
      <h2 className="text-base font-semibold text-white">Countries</h2>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-neutral-300">Country</label>
        <CountrySelect
          value={country}
          onChange={(code) => {
            setCountry(code);
            if (code === country2) setCountry2("");
            setStatus(null);
          }}
        />
      </div>

      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-neutral-300">
          Second country <span className="text-neutral-500 font-normal">(optional)</span>
        </label>
        <CountrySelect
          value={country2}
          onChange={(code) => {
            setCountry2(code);
            setStatus(null);
          }}
          noneLabel="None"
          exclude={country}
        />
        <p className="text-xs text-neutral-500">Shown as a second flag next to your name.</p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!changed || saving}
          className="px-4 py-2 text-sm font-semibold bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {status && <span className={`text-xs ${status.ok ? "text-emerald-400" : "text-red-400"}`}>{status.text}</span>}
      </div>
    </form>
  );
}
