"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock3, Gamepad2, Loader2, LogOut, Swords, Trophy } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export function MatchLobby({ displayName, isGuest, recent = [] }: { displayName: string; isGuest: boolean; recent?: import("@/lib/match").RecentMatch[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/match/join", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "匹配失败");
      router.push(`/match/${data.matchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "匹配失败");
      setLoading(false);
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-[900px] items-center gap-3 px-4 sm:px-6">
          {isGuest ? (
            <button onClick={logout} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink" aria-label="退出游客">
              <ArrowLeft className="h-4 w-4" />
            </button>
          ) : (
            <Link href="/" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink" aria-label="返回首页">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-soft text-brand"><Gamepad2 className="h-4 w-4" /></span>
            <div>
              <div className="font-serif text-[15px] leading-4">1v1 随机竞赛</div>
              <div className="text-[9px] text-faint">10 题 · 实时 PK</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-[10px] text-muted sm:inline">{displayName}{isGuest ? " · 游客" : ""}</span>
            {isGuest && <button onClick={logout} className="inline-flex items-center gap-1 text-[10px] text-faint hover:text-ink"><LogOut className="h-3 w-3" /> 退出</button>}
            <ThemeToggle compact />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[760px] px-4 py-10 sm:px-6 sm:py-16">
        <div className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl border border-line bg-surface shadow-[0_12px_40px_rgba(60,50,30,0.06)]">
            <Swords className="h-7 w-7 text-accent" />
          </div>
          <h1 className="mt-5 font-serif text-[28px] leading-tight sm:text-[36px]">和一位对手，<br className="sm:hidden" />限时 1v1</h1>
          <p className="mx-auto mt-2 max-w-md text-[12px] leading-6 text-muted">
            系统会随机匹配一位在线考生，双方同时作答同一组 10 道题。每题有独立倒计时，答对得分，分数高者获胜。
          </p>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Gamepad2, title: "10 道混合题", desc: "政治 / 数学 / 408 / 英语" },
            { icon: Clock3, title: "按难度限时", desc: "基础 30s · 提高 45s · 冲刺 60s" },
            { icon: Trophy, title: "实时看进度", desc: "看到对手答到第几题、得多少分" },
          ].map((x, i) => (
            <div key={i} className="rounded-xl border border-line bg-surface p-4">
              <x.icon className="h-4 w-4 text-brand" />
              <div className="mt-2 text-[12px] font-medium text-ink">{x.title}</div>
              <div className="mt-1 text-[10px] leading-5 text-muted">{x.desc}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-2xl border border-line bg-surface p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.16em] text-faint">Current player</div>
              <div className="mt-1 font-serif text-[17px]">{displayName} {isGuest && <span className="ml-1 text-[10px] font-sans text-accent">游客</span>}</div>
            </div>
            <div className="text-right text-[10px] leading-5 text-muted">
              {isGuest ? "一次性会话 · 2 小时有效" : "成绩会保存在你的账号"}
            </div>
          </div>

          {error && <div className="mt-4 rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-[11px] text-accent">{error}</div>}

          <button
            onClick={start}
            disabled={loading}
            className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-ink text-[14px] font-medium text-paper transition-opacity disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
            {loading ? "正在进入匹配…" : "开始匹配"}
          </button>
          <p className="mt-2 text-center text-[9px] leading-4 text-faint">
            匹配后请保持页面打开；如果 90 秒内没有对手，可以返回重试。
          </p>
        </div>

        {recent.length > 0 && (
          <div className="mt-6 rounded-2xl border border-line bg-surface p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-[15px]">最近战绩</h2>
              <span className="text-[10px] text-faint">最近 {recent.length} 场</span>
            </div>
            <div className="mt-2 divide-y divide-line">
              {recent.map(r => (
                <div key={r.matchId} className="flex items-center gap-3 py-2.5 text-[11px]">
                  <span className={r.result === "win" ? "text-brand" : r.result === "lose" ? "text-accent" : "text-amber"}>
                    {r.result === "win" ? "胜" : r.result === "lose" ? "负" : "平"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-muted">vs {r.opponentName}</span>
                  <span className="font-medium text-ink">{r.score} : {r.opponentScore}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-[10px] text-faint">
          比赛题目由 AI 现场生成，若生成失败会自动从真题库补题。
        </p>
      </div>
    </main>
  );
}
