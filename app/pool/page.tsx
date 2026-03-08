"use client";

import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/store";

export default function PoolPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);

  function handleLogout() {
    clearAuth();
    router.push("/login");
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      <div className="text-center space-y-4">
        <p className="text-white text-xl font-medium">
          Hello{" "}
          <span className="text-violet-400 font-semibold">{user?.pseudo}</span>
          , welcome back.
        </p>
        <button
          onClick={handleLogout}
          className="text-sm text-neutral-500 hover:text-neutral-300 transition"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
