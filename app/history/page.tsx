import Link from "next/link";
import { ChevronRight, History as HistoryIcon, Target } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SubjectIcon } from "@/components/SubjectIcon";
import { Card, EmptyState, Progress } from "@/components/ui";
import { getHistory, getStats } from "@/lib/queries";
import { getRandomHistory, getRandomStats } from "@/lib/random";
import { requireUserPage } from "@/lib/auth";
import { SUBJECTS , subjectTint } from "@/lib/subjects";
import { formatDate, formatDay, pct, relativeTime, stripMarkdown } from "@/lib/utils";
import type { SubjectId } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ subject?: string }> }) {
  const sp = await searchParams;
  const filter = SUBJECTS.some(s => s.id === sp.subject) ? sp.subject as SubjectId : null;
  const session = await requireUserPage();
  const all = getHistory(session.userId!, 80);
  const items = filter ? all.filter(h => h.subject === filter) : all;
  const stats = getStats(session.userId!);
  const randomStats = getRandomStats(session.userId!);
  const randomHistory = getRandomHistory(session.userId!, 12);
  const groups = new Map<string, typeof items>();
  for (const h of items) {
    const key = formatDay(h.createdAt);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(h);
  }
  const graded = all.filter(h => h.answered > 0);
  const avg = graded.length ? Math.round(graded.reduce((s, h) => s + pct(h.score, h.paperScore), 0) / graded.length) : 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-[980px] px-5 py-8 lg:px-10 lg:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Practice log</div>
            <h1 className="mt-2 font-serif text-[30px] leading-tight sm:text-[36px]">练习记录</h1>
            <p className="mt-1 text-sm text-muted">每一次作答、跳过和批改都在这里。</p>
          </div>
          <div className="flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-2.5 text-[11px] text-muted">
            <span><Target className="mr-1 inline h-3.5 w-3.5 text-brand" /> 平均得分率 <b className="text-ink">{avg}%</b></span>
            <span className="h-4 w-px bg-line" />
            <span><HistoryIcon className="mr-1 inline h-3.5 w-3.5 text-accent" /> 累计 {stats.totalAttempts} 题</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-1.5">
          <Link href="/history" className={`rounded-full border px-3 py-1.5 text-[11px] ${!filter ? "border-ink bg-ink text-paper" : "border-line bg-surface text-muted hover:border-line-strong"}`}>全部</Link>
          {SUBJECTS.map(s => (
            <Link key={s.id} href={`/history?subject=${s.id}`} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] ${filter === s.id ? "border-ink bg-ink text-paper" : "border-line bg-surface text-muted hover:border-line-strong"}`}>
              <SubjectIcon id={s.id} className="h-3 w-3" /> {s.short}
            </Link>
          ))}
        </div>

        {randomStats.total > 0 && (
          <div className="mt-10">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="font-serif text-[15px]">随机刷题</h2>
              <span className="text-[10px] text-muted">{randomStats.correct}/{randomStats.total} 题 · {randomStats.accuracy}%</span>
              <div className="h-px flex-1 bg-line" />
              <Link href="/random" className="text-[10px] text-muted hover:text-ink">去随机 →</Link>
            </div>
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {randomHistory.map(r => {
                const s = SUBJECTS.find(x => x.id === r.subject);
                return (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3 text-[11px]">
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-md ${r.correct ? "bg-brand-soft text-brand" : "bg-accent-soft text-accent"}`}>
                      {r.correct ? "✓" : "×"}
                    </span>
                    <span className="w-16 shrink-0 text-muted">{s?.short || r.subject}</span>
                    <span className="min-w-0 flex-1 truncate text-ink">{stripMarkdown(r.stem, 70) || r.chapter}</span>
                    <span className="hidden text-[10px] text-faint sm:inline">{formatDate(r.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="mt-8">
            <EmptyState title="还没有练习记录" desc="选一科，生成第一组题。作答后这里会自动保存。" action={<Link href="/practice" className="rounded-lg bg-ink px-4 py-2 text-xs text-paper">开始刷题</Link>} />
          </div>
        ) : (
          <div className="mt-7 space-y-8">
            {[...groups.entries()].map(([day, list]) => (
              <div key={day}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="font-serif text-[15px]">{day}</h2>
                  <span className="text-[10px] text-muted">{list.length} 组</span>
                  <div className="h-px flex-1 bg-line" />
                </div>
                <div className="space-y-2">
                  {list.map(h => {
                    const subject = SUBJECTS.find(s => s.id === h.subject)!;
                    return (
                      <Link key={h.id} href={`/history/${h.id}`} className="block">
                        <Card className="p-4 transition-colors hover:border-line-strong hover:bg-surface-2 sm:p-5">
                          <div className="flex items-start gap-3.5">
                            <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={subjectTint(subject.accent)}>
                              <SubjectIcon id={h.subject} className="h-4 w-4" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate text-[13px] font-medium text-ink">{stripMarkdown(h.title, 46)}</span>
                                <span className="rounded-full bg-subtle px-2 py-0.5 text-[9px] text-muted">{subject.short}</span>
                              </div>
                              <div className="mt-1 text-[11px] text-muted">
                                {h.chapter || "综合"} · {h.answered}/{h.total} 题 · {relativeTime(h.createdAt)}
                              </div>
                              <div className="mt-2.5 flex items-center gap-3">
                                <Progress value={h.answered} max={h.total} className="max-w-[180px]" />
                                <span className="text-[10px] text-muted">对 {h.correct}</span>
                              </div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="font-serif text-[19px] text-ink">{h.answered ? h.score : "—"}</div>
                              <div className="text-[9px] text-muted">{h.answered ? `/ ${h.paperScore} 分` : "未作答"}</div>
                            </div>
                            <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-faint" />
                          </div>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
