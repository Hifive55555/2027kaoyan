import { getStats } from "@/lib/queries";
import { requireUserPage } from "@/lib/auth";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import Link from "next/link";
import { Settings, Compass } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await requireUserPage();
  const stats = getStats(session.userId!);
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar streak={stats.streak} todayCount={stats.todayCount} accuracy={stats.accuracy} displayName={session.displayName} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur sm:px-5 lg:hidden">
          <Link href="/" className="flex min-w-0 items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-line-strong bg-surface-2 font-serif text-sm">备</span>
            <span className="truncate font-serif text-sm">备考台 · 2027</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-3">
            <span className="hidden whitespace-nowrap text-[11px] text-muted min-[380px]:inline">今日 {stats.todayCount} 题 · 连续 {stats.streak} 天</span>
            <Link href="/syllabus" aria-label="2027 大纲" className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink"><Compass className="h-4 w-4" /></Link>
            <ThemeToggle compact />
            <Link href="/settings" aria-label="设置" className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink"><Settings className="h-4 w-4" /></Link>
          </div>
        </header>
        <div className="pb-24 lg:pb-0">{children}</div>
      </div>
      <MobileNav />
    </div>
  );
}
