"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem("yantu-theme"); } catch { /* ignore */ }
    const should = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", should);
    setDark(should);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("yantu-theme", next ? "dark" : "light"); } catch { /* ignore */ }
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "切换到亮色模式" : "切换到暗黑模式"}
      className={`inline-flex items-center justify-center rounded-lg text-muted transition-colors hover:bg-hover hover:text-ink ${compact ? "h-8 w-8" : "h-9 gap-2 px-3 text-[11px]"}`}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      {!compact && (dark ? "亮色" : "暗黑")}
    </button>
  );
}
