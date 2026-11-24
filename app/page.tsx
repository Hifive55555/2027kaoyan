import Link from "next/link";
import { ArrowUpRight, ChevronRight, Flame, Target, TrendingUp, CalendarClock, Dices, Swords } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SubjectIcon } from "@/components/SubjectIcon";
import { Card, Progress, SectionTitle } from "@/components/ui";
import { SUBJECTS , subjectTint } from "@/lib/subjects";
import { getHistory, getLatestPaper, getStats } from "@/lib/queries";
import { requireUserPage } from "@/lib/auth";
import { daysUntil, formatDate, pct, relativeTime, stripMarkdown } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await requireUserPage();
  const stats = getStats(session.userId!);
  const latest = getLatestPaper(session.userId!);
  const history = getHistory(session.userId!, 6);
  const days = daysUntil("2026-12-19");
  const maxWeek = Math.max(1, ...stats.recentDays.map(d => d.count));

  return (
    <AppShell>
      <div className="mx-auto max-w-[1180px] px-5 py-8 lg:px-10 lg:py-12">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              2027 全国硕士研究生招生考试
            </div>
            <h1 className="mt-3 font-serif text-[30px] leading-[1.15] tracking-tight text-ink sm:text-[38px]">
              今天，练哪一科？
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted">
              按 2027 大纲动态组卷，做完即批。真题库覆盖政治 2006—2026、英语二 2010—2026、数学二 2006—2026、408 2009—2026。
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
            <CalendarClock className="h-5 w-5 text-brand" strokeWidth={1.6} />
            <div>
              <div className="text-[10px] uppercase tracking-[0.14em] text-muted">初试倒计时</div>
              <div className="mt-0.5 font-serif text-xl leading-6 text-ink">
                {days > 0 ? <>还有 <span className="text-accent">{days}</span> 天</> : "初试进行中"}
              </div>
            </div>
          </div>
        </div>

        {latest && (
          <Link href={`/practice/${latest.id}`} className="group mt-8 block">
            <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-surface-2 p-5 transition-shadow hover:shadow-[0_8px_30px_rgba(60,50,30,0.06)] sm:p-6">
              <div className="absolute right-0 top-0 h-28 w-28 translate-x-8 -translate-y-8 rounded-full bg-brand-soft/70 blur-2xl" />
              <div className="relative flex flex-wrap items-center gap-4">
                <div className="grid h-11 w-11 place-items-center rounded-xl" style={subjectTint(SUBJECTS.find(s => s.id === latest.subject)?.accent)}>
                  <SubjectIcon id={latest.subject} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted">
                    <span className="rounded-full bg-subtle px-2 py-0.5">继续上次</span>
                    <span>{relativeTime(latest.createdAt)}</span>
                  </div>
                  <div className="mt-1.5 truncate font-serif text-[17px] text-ink">{latest.title}</div>
                  <div className="mt-1 text-xs text-muted">
                    已作答 {latest.answered} / {latest.total} 题
                    {latest.answered > 0 && <> · 得分 {latest.score} / {latest.paperScore}</>}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="hidden w-32 sm:block">
                    <Progress value={latest.answered} max={latest.total} />
                  </div>
                  <ArrowUpRight className="h-5 w-5 text-faint transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
              </div>
            </div>
          </Link>
        )}

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link href="/random" className="group">
            <Card className="relative overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_10px_30px_rgba(60,50,30,0.06)]">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand"><Dices className="h-5 w-5" /></span>
                <div>
                  <div className="font-serif text-[17px]">随机刷题</div>
                  <div className="mt-0.5 text-[10px] text-muted">打开就是一题，点选项即判</div>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-3 text-[11px] leading-5 text-muted">不选科目、不组卷。从真题里随机抽一道客观题，随时停下。</p>
            </Card>
          </Link>
          <Link href="/match" className="group">
            <Card className="relative overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_10px_30px_rgba(60,50,30,0.06)]">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent"><Swords className="h-5 w-5" /></span>
                <div>
                  <div className="font-serif text-[17px]">1v1 竞赛</div>
                  <div className="mt-0.5 text-[10px] text-muted">匹配在线考生，限时 PK</div>
                </div>
                <ChevronRight className="ml-auto h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-3 text-[11px] leading-5 text-muted">10 道混合题，每题独立倒计时，实时看到对手进度。</p>
            </Card>
          </Link>
        </div>

        <div className="mt-10">
          <SectionTitle action={<Link href="/practice" className="text-xs text-muted hover:text-ink">自定义组卷 <ChevronRight className="inline h-3.5 w-3.5" /></Link>}>
            四科练习
          </SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {SUBJECTS.map(s => {
              const st = stats.subjectStats[s.id] || { attempts: 0, correct: 0 };
              const acc = pct(st.correct, st.attempts);
              return (
                <Link key={s.id} href={`/practice?subject=${s.id}`} className="group">
                  <Card className="relative h-full overflow-hidden p-5 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_10px_30px_rgba(60,50,30,0.06)] sm:p-6">
                    <div className="flex items-start justify-between gap-3">
                      <span className="grid h-10 w-10 place-items-center rounded-xl" style={subjectTint(s.accent)}>
                        <SubjectIcon id={s.id} />
                      </span>
                      <span className="font-mono text-[10px] tracking-wider text-faint">{s.code}</span>
                    </div>
                    <div className="mt-4 flex items-baseline gap-2">
                      <h3 className="font-serif text-[19px] text-ink">{s.name}</h3>
                      <span className="text-[10px] text-muted">{s.duration} 分钟 · {s.totalScore} 分</span>
                    </div>
                    <p className="mt-2 line-clamp-2 min-h-[40px] text-xs leading-5 text-muted">{s.description}</p>
                    <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[11px]">
                      <span className="text-muted">
                        {st.attempts ? <>已练 {st.attempts} 题 · 正确率 <span className="font-medium text-ink">{acc}%</span></> : "还没有练习记录"}
                      </span>
                      <span className="inline-flex items-center gap-1 font-medium text-brand opacity-0 transition-opacity group-hover:opacity-100">
                        开始 <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-lg">最近 7 天</h2>
              <span className="text-[11px] text-muted">今日 {stats.todayCount} 题</span>
            </div>
            <div className="mt-6 flex h-28 items-end gap-2">
              {stats.recentDays.map(d => (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-2">
                  <div className="flex h-20 w-full items-end justify-center">
                    <div
                      className="w-full max-w-9 rounded-t-md bg-brand-soft transition-all"
                      style={{ height: `${Math.max(6, (d.count / maxWeek) * 80)}px`, backgroundColor: d.count ? "var(--color-brand)" : "var(--color-track)" }}
                      title={`${d.date}: ${d.count} 题`}
                    />
                  </div>
                  <span className="text-[9px] text-faint">{d.date.slice(5)}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 grid grid-cols-3 divide-x divide-line border-t border-line pt-4 text-center">
              <div>
                <div className="font-serif text-xl">{stats.totalAttempts}</div>
                <div className="mt-0.5 text-[10px] text-muted">累计作答</div>
              </div>
              <div>
                <div className="font-serif text-xl">{stats.accuracy}%</div>
                <div className="mt-0.5 text-[10px] text-muted">正确率</div>
              </div>
              <div>
                <div className="font-serif text-xl">{stats.mistakes}</div>
                <div className="mt-0.5 text-[10px] text-muted">错题待复盘</div>
              </div>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-accent" strokeWidth={1.8} />
              <h2 className="font-serif text-lg">练习建议</h2>
            </div>
            <div className="mt-4 space-y-3 text-xs leading-5 text-muted">
              <p><span className="font-medium text-ink">先做一组 8 题的小卷。</span> 选择+填空+解答混排，比只刷单选更接近考场。</p>
              <p><span className="font-medium text-ink">错题不要立刻看答案。</span> 先写清卡点，再看解析，最后点「做同类题」验证。</p>
              <p><span className="font-medium text-ink">用「追问」把一道题吃透。</span> 问为什么、问另一解、问这个考点还能怎么考。</p>
            </div>
            <Link href="/mistakes" className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-brand">
              去复盘错题 <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </Card>
        </div>

        <div className="mt-10">
          <SectionTitle action={<Link href="/history" className="text-xs text-muted hover:text-ink">全部记录 <ChevronRight className="inline h-3.5 w-3.5" /></Link>}>
            练习记录
          </SectionTitle>
          {history.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line bg-surface/60 px-5 py-10 text-center text-sm text-muted">
              还没有记录。选一科，生成第一组题吧。
            </div>
          ) : (
            <div className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
              {history.map(h => (
                <Link key={h.id} href={`/practice/${h.id}`} className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:px-5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={subjectTint(SUBJECTS.find(s => s.id === h.subject)?.accent)}>
                    <SubjectIcon id={h.subject} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-ink">{stripMarkdown(h.title, 42)}</div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {formatDate(h.createdAt)} · {h.answered}/{h.total} 题
                      {h.answered > 0 && <> · {h.score}/{h.paperScore} 分</>}
                    </div>
                  </div>
                  <div className="hidden items-center gap-1 text-[11px] text-muted sm:flex">
                    {h.correct > 0 ? <><TrendingUp className="h-3.5 w-3.5 text-brand" /> 对 {h.correct}</> : "待复盘"}
                  </div>
                  <ChevronRight className="h-4 w-4 text-faint" />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3 border-t border-line py-6 text-[11px] text-faint">
          <span className="inline-flex items-center gap-1"><Flame className="h-3.5 w-3.5" /> 连续 {stats.streak} 天</span>
          <span>·</span>
          <span>题目由 DeepSeek Flash 动态生成，仅用于个人备考</span>
          <span className="ml-auto">2027 大纲 · 更新于 2026-11</span>
        </div>
      </div>
    </AppShell>
  );
}
