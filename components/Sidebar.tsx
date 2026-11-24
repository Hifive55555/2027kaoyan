"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, PenLine, Library, History, BookmarkX, Settings, Compass, Flame, ChevronRight,
  Dices, Gamepad2, LogOut, UserRound, MessageCircle,
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { SUBJECTS , subjectTint } from "@/lib/subjects";
import { cn } from "@/lib/utils";
import { SubjectIcon } from "./SubjectIcon";

const NAV = [
  { href: "/", label: "今日", icon: Home },
  { href: "/practice", label: "开始刷题", icon: PenLine },
  { href: "/random", label: "随机刷题", icon: Dices },
  { href: "/tutor", label: "答疑", icon: MessageCircle },
  { href: "/match", label: "1v1 比赛", icon: Gamepad2 },
  { href: "/corpus", label: "真题库", icon: Library },
  { href: "/history", label: "练习记录", icon: History },
  { href: "/mistakes", label: "错题本", icon: BookmarkX },
  { href: "/syllabus", label: "2027 大纲", icon: Compass },
];

export function Sidebar({ streak, todayCount, accuracy, displayName }: { streak: number; todayCount: number; accuracy: number; displayName: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col border-r border-line bg-paper-2 px-4 py-5 lg:flex">
      <Link href="/" className="flex items-center gap-3 px-2">
        <div className="grid h-10 w-10 place-items-center rounded-xl border border-line-strong bg-surface-2 font-serif text-lg text-ink shadow-sm">
          备
        </div>
        <div>
          <div className="font-serif text-[17px] leading-5 tracking-tight text-ink">备考台</div>
          <div className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-muted">2027 刷题台</div>
        </div>
      </Link>

      <nav className="mt-8 space-y-1">
        {NAV.map(item => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors",
                isActive(item.href)
                  ? "bg-hover font-medium text-ink"
                  : "text-muted hover:bg-hover hover:text-ink"
              )}
            >
              <Icon className={cn("h-4 w-4", isActive(item.href) ? "text-brand" : "text-faint")} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.href === "/mistakes" && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-0 transition group-hover:opacity-60" />}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8">
        <div className="px-3 pb-2 text-[10px] font-medium uppercase tracking-[0.16em] text-faint">我的科目</div>
        <div className="space-y-0.5">
          {SUBJECTS.map(s => (
            <Link
              key={s.id}
              href={`/practice?subject=${s.id}`}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] text-muted transition-colors hover:bg-hover hover:text-ink"
            >
              <span className="grid h-6 w-6 place-items-center rounded-md" style={subjectTint(s.accent)}>
                <SubjectIcon id={s.id} className="h-3.5 w-3.5" />
              </span>
              <span>{s.name}</span>
              <span className="ml-auto font-mono text-[10px] text-faint">{s.code}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-auto space-y-3 pt-6">
        <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-2.5 py-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
            <UserRound className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[11px] font-medium text-ink">{displayName}</div>
            <div className="text-[9px] text-faint">已登录 · 独立记录</div>
          </div>
          <button onClick={logout} aria-label="退出登录" className="rounded-md p-1.5 text-faint hover:bg-hover hover:text-ink">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="rounded-xl border border-line-strong bg-surface-2 p-3">
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <Flame className="h-3.5 w-3.5 text-accent" />
            <span>连续 {streak} 天</span>
            <span className="ml-auto">今日 {todayCount} 题</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-muted">
            <span>累计正确率</span>
            <span className="font-medium text-ink">{accuracy}%</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-track">
            <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, accuracy)}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Link href="/settings" className="flex flex-1 items-center gap-2 px-3 py-1 text-[11px] text-faint hover:text-ink">
            <Settings className="h-3.5 w-3.5" /> 设置与模型
            <span className="ml-auto rounded-full bg-brand-soft px-2 py-0.5 text-[9px] text-brand">Flash</span>
          </Link>
          <ThemeToggle compact />
        </div>
      </div>
    </aside>
  );
}
