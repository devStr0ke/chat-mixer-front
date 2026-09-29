"use client";

import { useEffect, useRef, useState } from "react";
import { COUNTRIES } from "@/lib/countries";
import { Flag } from "./Flag";

/**
 * Searchable country dropdown. With `noneLabel`, the list starts with an
 * option that clears the value (for optional fields).
 */
export function CountrySelect({
  value,
  onChange,
  placeholder = "Select your country…",
  noneLabel,
  exclude,
}: {
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  noneLabel?: string;
  exclude?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = COUNTRIES.find((c) => c.code === value) ?? null;
  const q = search.trim().toLowerCase();
  const filtered = COUNTRIES.filter(
    (c) => c.code !== exclude && (!q || c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function pick(code: string) {
    onChange(code);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setSearch("");
        }}
        className={`w-full flex items-center gap-2.5 rounded-lg bg-neutral-800 border px-4 py-2.5 text-sm text-left transition focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent ${
          open ? "border-violet-500" : "border-neutral-700"
        }`}
      >
        {selected ? (
          <>
            <Flag code={selected.code} />
            <span className="text-white">{selected.name}</span>
          </>
        ) : (
          <span className="text-neutral-500">{value === "" && noneLabel ? noneLabel : placeholder}</span>
        )}
        <svg className="ml-auto w-4 h-4 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
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
            {noneLabel && !q && (
              <li>
                <button
                  type="button"
                  onClick={() => pick("")}
                  className={`w-full px-4 py-2 text-sm text-left hover:bg-neutral-700 transition ${
                    value === "" ? "text-violet-400" : "text-neutral-400"
                  }`}
                >
                  {noneLabel}
                </button>
              </li>
            )}
            {filtered.length === 0 && <li className="px-4 py-3 text-sm text-neutral-500">No results</li>}
            {filtered.map((c) => (
              <li key={c.code}>
                <button
                  type="button"
                  onClick={() => pick(c.code)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm text-left hover:bg-neutral-700 transition ${
                    value === c.code ? "text-violet-400" : "text-neutral-200"
                  }`}
                >
                  <Flag code={c.code} />
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
