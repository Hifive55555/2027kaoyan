"use client";

import { LogOut } from "lucide-react";

export function LogoutButton() {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <button onClick={logout} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[10px] text-muted hover:border-line-strong hover:text-ink">
      <LogOut className="h-3.5 w-3.5" /> 退出登录
    </button>
  );
}
