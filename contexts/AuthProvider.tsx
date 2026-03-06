"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/store";

/**
 * Hydrates the Zustand auth store from localStorage on the client.
 * Place this high in the component tree (e.g. inside RootLayout).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return <>{children}</>;
}
