"use client";

import { useEffect } from "react";
import { getMe } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

const PUBLIC_PATHS = ["/login", "/register"];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);
  const setUser = useAuthStore((s) => s.setUser);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  useEffect(() => {
    hydrate();
    if (!useAuthStore.getState().token) return;

    // refresh the cached profile (avatar, flags may have changed elsewhere)
    getMe()
      .then(setUser)
      .catch((err) => {
        if ((err as { status?: number }).status !== 401) return;
        clearAuth();
        if (!PUBLIC_PATHS.some((p) => window.location.pathname.startsWith(p))) {
          window.location.assign("/login");
        }
      });
  }, [hydrate, setUser, clearAuth]);

  return <>{children}</>;
}
