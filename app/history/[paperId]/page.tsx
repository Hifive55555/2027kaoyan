import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { ReviewList } from "@/components/ReviewList";
import { Card } from "@/components/ui";
import { getPaper } from "@/lib/queries";
import { requireUserPage } from "@/lib/auth";
import { getSubject } from "@/lib/subjects";
import { formatDate, pct } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function HistoryDetailPage({ params }: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await params;
  const session = await requireUserPage();
  const paper = getPaper(paperId, { revealAll: true, userId: session.userId! });
  if (!paper) notFound();
  const subject = getSubject(paper.subject);
  const attempted = paper.questions.filter(q => q.attempt && !q.attempt.skipped);
  const correct = attempted.filter(q => q.attempt?.verdict === "correct").length;
  const score = attempted.reduce((s, q) => s + (q.attempt?.score || 0), 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-[980px] px-5 py-8 lg:px-10 lg:py-12">
        <Link href="/history" className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> 返回记录
        </Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted">{subject?.name} · {formatDate(paper.createdAt)}</div>
            <h1 className="mt-2 max-w-2xl font-serif text-[26px] leading-tight sm:text-[32px]">{paper.title}</h1>
            <p className="mt-1 text-sm text-muted">{paper.chapter} · {paper.questions.length} 题</p>
          </div>
          <Link href={`/practice/${paper.id}`} className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-3 py-2 text-[11px] hover:border-line-strong">
            <RotateCcw className="h-3.5 w-3.5" /> 继续作答
          </Link>
        </div>

        <Card className="mt-6 p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div><div className="font-serif text-2xl">{score}<span className="text-xs text-muted">/{paper.totalScore}</span></div><div className="text-[10px] text-muted">得分</div></div>
            <div><div className="font-serif text-2xl">{pct(correct, attempted.length)}%</div><div className="text-[10px] text-muted">正确率</div></div>
            <div><div className="font-serif text-2xl">{attempted.length}<span className="text-xs text-muted">/{paper.questions.length}</span></div><div className="text-[10px] text-muted">已作答</div></div>
            <div><div className="font-serif text-2xl">{paper.questions.filter(q => q.attempt?.skipped).length}</div><div className="text-[10px] text-muted">跳过</div></div>
          </div>
        </Card>

        <div className="mt-8">
          <h2 className="mb-4 font-serif text-xl">逐题回看</h2>
          <ReviewList paper={paper} />
        </div>
        <div className="mt-8 flex justify-end">
          <Link href={`/practice?subject=${paper.subject}&chapter=${paper.chapterIds[0] || ""}`} className="inline-flex items-center gap-1 rounded-lg bg-ink px-4 py-2.5 text-[11px] text-paper">
            再练一组 <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </AppShell>
  );
}
