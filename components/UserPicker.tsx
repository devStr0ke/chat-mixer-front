"use client";

import { useEffect, useRef, useState } from "react";
import { searchUsers, type UserSummary } from "@/lib/api";
import { Flag } from "./Flag";

const SEARCH_DEBOUNCE = 200;

/**
 * Pseudo search box with a suggestion dropdown. Users in `excludeIds`
 * (already members, already picked…) are hidden from the suggestions.
 */
export function UserPicker({
  onSelect,
  excludeIds = [],
  placeholder = "Search by pseudo…",
  disabled = false,
}: {
  onSelect: (user: UserSummary) => void;
  excludeIds?: string[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const users = await searchUsers(q);
        if (!cancelled) {
          setResults(users);
          setHighlight(0);
        }
      } catch {
        if (!cancelled) setResults([]);
      }
    }, SEARCH_DEBOUNCE);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const suggestions = query.trim() ? results.filter((u) => !excludeIds.includes(u.id)) : [];

  function pick(user: UserSummary) {
    onSelect(user);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(suggestions[Math.min(highlight, suggestions.length - 1)]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className="w-full rounded-lg bg-neutral-800 border border-neutral-700 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent transition disabled:opacity-50"
      />
      {open && query.trim() && (
        <ul className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-lg bg-neutral-800 border border-neutral-700 shadow-xl">
          {suggestions.length === 0 ? (
            <li className="px-4 py-3 text-sm text-neutral-500">No users found</li>
          ) : (
            suggestions.map((u, i) => (
              <li key={u.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(u)}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left transition ${
                    i === highlight ? "bg-neutral-700 text-white" : "text-neutral-200"
                  }`}
                >
                  <Flag code={u.country} />
                  {u.pseudo}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
