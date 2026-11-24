import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, RotateCcw, Trophy } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ReviewList } from "@/components/ReviewList";
import { Card } from "@/components/ui";
import { getPaper } from "@/lib/queries";
import { requireUserPage } from "@/lib/auth";
import { getSubject } from "@/lib/subjects";
import { pct } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SummaryPage({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const session = await requireUserPage();
  const paper = getPaper(paperId, { revealAll: true, userId: session.userId! });
  if (!paper) notFound();
  const subject = getSubject(paper.subject);
  const attempted = paper.questions.filter(q => q.attempt && !q.attempt.skipped);
  const correct = attempted.filter(q => q.attempt?.verdict === "correct").length;
  const partial = attempted.filter(q => q.attempt?.verdict === "partial").length;
  const wrong = attempted.filter(q => q.attempt?.verdict === "wrong").length;
  const skipped = paper.questions.filter(q => q.attempt?.skipped).length;
  const score = attempted.reduce((s, q) => s + (q.attempt?.score || 0), 0);
  const rate = pct(score, paper.totalScore);
  const accuracy = pct(correct, attempted.length);
  const circumference = 2 * Math.PI * 52;

  const byChapter = new Map<string, { total: number; max: number; score: number; done: number }>();
  for (const q of paper.questions) {
    const k = q.chapter || "综合";
    if (!byChapter.has(k)) byChapter.set(k, { total: 0, max: 0, score: 0, done: 0 });
    const b = byChapter.get(k)!;
    b.total++;
    b.max += q.score;
    if (q.attempt) { b.done++; b.score += q.attempt.score || 0; }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[980px] px-5 py-8 lg:px-10 lg:py-12">
        <Link href={`/practice/${paper.id}`} className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> 回到试卷
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Session summary</div>
            <h1 className="mt-2 font-serif text-[30px] leading-tight sm:text-[36px]">本次总结</h1>
            <p className="mt-1 text-sm text-muted">{paper.title}</p>
          </div>
          <Link href={`/practice?subject=${paper.subject}&chapter=${paper.chapterIds[0] || ""}`} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] text-ink hover:border-line-strong">
            再练一组 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <Card className="mt-7 overflow-hidden">
          <div className="grid gap-6 p-6 sm:grid-cols-[auto_1fr] sm:p-8">
            <div className="relative grid place-items-center">
              <svg width="132" height="132" viewBox="0 0 132 132" className="-rotate-90">
                <circle cx="66" cy="66" r="52" fill="none" stroke="var(--color-line)" strokeWidth="8" />
                <circle cx="66" cy="66" r="52" fill="none" stroke="var(--color-brand)" strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={circumference} strokeDashoffset={circumference * (1 - Math.min(1, rate / 100))} />
              </svg>
              <div className="absolute text-center">
                <div className="font-serif text-[30px] leading-none">{score}<span className="text-sm text-muted">/{paper.totalScore}</span></div>
                <div className="mt-1 text-[10px] text-muted">得分</div>
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-serif text-lg">
                <Trophy className="h-4 w-4 text-accent" /> {rate >= 85 ? "状态很稳" : rate >= 60 ? "基础在线，继续抠细节" : "先复盘，再刷新题"}
              </div>
              <p className="mt-1 text-[12px] leading-6 text-muted">
                {subject?.name} · 作答 {attempted.length}/{paper.questions.length} 题 · 正确率 {accuracy}%
                {skipped > 0 && <> · 跳过 {skipped} 题</>}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["答对", correct, "text-brand"],
                  ["部分得分", partial, "text-amber"],
                  ["答错", wrong, "text-accent"],
                  ["未作答/跳过", paper.questions.length - attempted.length, "text-muted"],
                ].map(([label, value, color]) => (
                  <div key={String(label)} className="rounded-lg bg-sand px-3 py-2.5">
                    <div className={`font-serif text-xl ${color}`}>{value}</div>
                    <div className="mt-0.5 text-[9px] text-muted">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-serif text-base">章节表现</h2>
            <div className="mt-3 space-y-3">
              {[...byChapter.entries()].map(([chapter, b]) => {
                const p = b.max ? Math.round((b.score / b.max) * 100) : 0;
                return (
                  <div key={chapter}>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="truncate text-ink">{chapter}</span>
                      <span className="ml-3 shrink-0 text-muted">{b.done}/{b.total} 题</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-track">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, p)}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
          <Card className="p-5">
            <h2 className="font-serif text-base">下一步</h2>
            <div className="mt-2 space-y-2 text-[11px] leading-5 text-muted">
              <p>· 先看错题的「失分点」，再点开解析对照自己的步骤。</p>
              <p>· 对没有把握的题点「做同类题」，换数验证是否真会。</p>
              <p>· 如果整卷超时，下次把选择/填空控制在 50 分钟内。</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href="/mistakes" className="inline-flex items-center gap-1 rounded-lg bg-ink px-3 py-2 text-[11px] text-paper">复盘错题 <ArrowRight className="h-3.5 w-3.5" /></Link>
              <Link href={`/practice?subject=${paper.subject}&chapter=${paper.chapterIds[0] || ""}`} className="inline-flex items-center gap-1 rounded-lg border border-line px-3 py-2 text-[11px]">重新组卷 <RotateCcw className="h-3.5 w-3.5" /></Link>
            </div>
          </Card>
        </div>

        <div className="mt-8">
          <h2 className="mb-4 font-serif text-xl">逐题回看</h2>
          <ReviewList paper={paper} />
        </div>
      </div>
    </AppShell>
  );
}
