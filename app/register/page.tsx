"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { register } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { COUNTRIES, flagUrl } from "@/lib/countries";

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [pseudo, setPseudo] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedCountry = COUNTRIES.find((c) => c.code === country) ?? null;
  const filtered = search.trim()
    ? COUNTRIES.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.code.toLowerCase().includes(search.toLowerCase())
      )
    : COUNTRIES;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await register({ pseudo, email, country, password });
      setAuth(data.token, data.user);
      router.push("/pool");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-neutral-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Chat<span className="text-violet-500">Mixer</span>
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Anonymous ephemeral conversations
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8 space-y-5 shadow-2xl"
        >
          <h2 className="text-xl font-semibold text-white">Create account</h2>

          {error && (
            <div className="rounded-lg bg-red-900/40 border border-red-700 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-300">
              Pseudo
            </label>
            <input
              type="text"
              value={pseudo}
              onChange={(e) => setPseudo(e.target.value)}
              required
              minLength={2}
              maxLength={32}
              placeholder="e.g. shadow_fox"
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-300">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-300">
              Country
            </label>
            <div ref={dropdownRef} className="relative">
              <input type="hidden" name="country" value={country} required />
              <button
                type="button"
                onClick={() => {
                  setDropdownOpen((v) => !v);
                  setSearch("");
                }}
                className={`w-full flex items-center gap-2.5 rounded-lg bg-neutral-800 border px-4 py-2.5 text-sm text-left transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent ${
                  dropdownOpen ? "border-violet-500" : "border-neutral-700"
                }`}
              >
                {selectedCountry ? (
                  <>
                    <img
                      src={flagUrl(selectedCountry.code)}
                      alt={selectedCountry.code}
                      width={20}
                      height={15}
                      className="rounded-sm object-cover flex-shrink-0"
                    />
                    <span className="text-white">{selectedCountry.name}</span>
                  </>
                ) : (
                  <span className="text-neutral-500">Select your country…</span>
                )}
                <svg
                  className="ml-auto w-4 h-4 text-neutral-500 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="absolute z-50 mt-1 w-full rounded-lg bg-neutral-800 border border-neutral-700 shadow-xl overflow-hidden">
                  <div className="p-2 border-b border-neutral-700">
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search…"
                      autoFocus
                      className="w-full rounded-md bg-neutral-700 border border-neutral-600 px-3 py-1.5 text-sm text-white placeholder-neutral-400 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </div>
                  <ul className="max-h-52 overflow-y-auto">
                    {filtered.length === 0 && (
                      <li className="px-4 py-3 text-sm text-neutral-500">No results</li>
                    )}
                    {filtered.map((c) => (
                      <li key={c.code}>
                        <button
                          type="button"
                          onClick={() => {
                            setCountry(c.code);
                            setDropdownOpen(false);
                            setSearch("");
                          }}
                          className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left hover:bg-neutral-700 transition ${
                            country === c.code ? "text-violet-400" : "text-neutral-200"
                          }`}
                        >
                          <img
                            src={flagUrl(c.code)}
                            alt={c.code}
                            width={20}
                            height={15}
                            className="rounded-sm object-cover flex-shrink-0"
                          />
                          {c.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-neutral-300">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Min 6 characters"
              autoComplete="new-password"
              className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !country}
            className="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg py-2.5 text-sm transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-neutral-900"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>

          <p className="text-center text-sm text-neutral-500">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-violet-400 hover:text-violet-300 transition"
            >
              Sign in
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
