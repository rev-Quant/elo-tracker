"use client";

import { useRouter } from "next/navigation";
import { api } from "@/lib/api-client";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await api.post("/api/auth/logout");
    router.push("/");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      className="text-[0.75rem] font-medium text-muted-dim hover:text-down transition-colors"
    >
      Sign out
    </button>
  );
}