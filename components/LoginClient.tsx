"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Loader2, LockKeyhole, Sparkles, UserRound, Gamepad2 } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export function LoginClient({ next }: { next: string }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [guestLoading, setGuestLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password || loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "登录失败");
      router.push(next || "/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
      setLoading(false);
    }
  }

  async function guest() {
    if (guestLoading) return;
    setGuestLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/guest", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "游客登录失败");
      router.push("/match");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "游客登录失败");
      setGuestLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="absolute right-4 top-4"><ThemeToggle /></div>
      <div className="w-full max-w-[420px]">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-line-strong bg-surface font-serif text-xl shadow-sm">备</div>
          <div>
            <div className="font-serif text-xl tracking-tight">备考台 · 2027</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-muted">Practice desk</div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-[0_20px_60px_rgba(60,50,30,0.08)] sm:p-7">
          <h1 className="font-serif text-[24px] leading-tight">登录你的备考台</h1>
          <p className="mt-1.5 text-[12px] leading-5 text-muted">
            两个账号的练习记录、错题和随机刷题数据相互独立。
          </p>

          <form onSubmit={submit} className="mt-6 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-muted">用户名</span>
              <div className="flex items-center gap-2 rounded-xl border border-line bg-paper-2 px-3 focus-within:border-brand/50">
                <UserRound className="h-4 w-4 text-faint" />
                <input
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  placeholder="hifive"
                  className="h-11 w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
                />
              </div>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-muted">密码</span>
              <div className="flex items-center gap-2 rounded-xl border border-line bg-paper-2 px-3 focus-within:border-brand/50">
                <LockKeyhole className="h-4 w-4 text-faint" />
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="h-11 w-full bg-transparent text-[13px] outline-none placeholder:text-faint"
                />
              </div>
            </label>

            {error && <div className="rounded-lg border border-accent/25 bg-accent-soft px-3 py-2 text-[11px] text-accent">{error}</div>}

            <button
              type="submit"
              disabled={loading || !username || !password}
              className="mt-2 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[13px] font-medium text-paper transition-opacity disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "登录中…" : "进入备考台"}
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[9px] uppercase tracking-[0.16em] text-faint">
            <span className="h-px flex-1 bg-line" /> 或者 <span className="h-px flex-1 bg-line" />
          </div>

          <button
            onClick={guest}
            disabled={guestLoading}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-paper-2 text-[12px] text-ink transition-colors hover:border-line-strong disabled:opacity-50"
          >
            {guestLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gamepad2 className="h-4 w-4 text-accent" />}
            游客进入 1v1（一次性会话）
          </button>
          <p className="mt-2 text-center text-[9px] leading-4 text-faint">
            游客只能参加 1v1 比赛，记录不保存到账号，2 小时后自动失效。
          </p>
        </div>

        <div className="mt-5 flex items-center justify-between text-[10px] text-faint">
          <Link href="/login" className="hover:text-ink">备考台 · 2027 考研刷题台</Link>
          <span>DeepSeek Flash · 2027 大纲</span>
        </div>
      </div>
    </main>
  );
}
