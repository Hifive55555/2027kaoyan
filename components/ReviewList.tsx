import Link from "next/link";
import { ChevronDown, CircleCheck, CircleX, MinusCircle } from "lucide-react";
import type { PaperPublic, QuestionPublic } from "@/lib/types";
import { typeLabel, TYPE_COLOR } from "@/lib/subjects";
import { cn } from "@/lib/utils";
import { Markdown } from "./Markdown";
import { Badge } from "./ui";

export function ReviewList({ paper, retry = true }: { paper: PaperPublic; retry?: boolean }) {
  return (
    <div className="space-y-6">
      {paper.sections.map(section => {
        const qs = paper.questions.filter(q => q.sectionId === section.id);
        if (!qs.length) return null;
        return (
          <div key={section.id}>
            {section.material && (
              <div className="mb-3 rounded-xl border border-line bg-surface-3 px-4 py-3">
                <div className="mb-1 text-[9px] uppercase tracking-[0.16em] text-muted">材料</div>
                <div className="max-h-72 overflow-y-auto">
                  <Markdown className="text-[12.5px] leading-6 text-muted">{section.material}</Markdown>
                </div>
              </div>
            )}
            <div className="space-y-3">
              {qs.map(q => <ReviewQuestion key={q.id} q={q} retry={retry} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function statusOf(q: QuestionPublic) {
  if (!q.attempt) return { label: "未作答", color: "text-muted", bg: "bg-subtle", Icon: MinusCircle };
  if (q.attempt.skipped) return { label: "已跳过", color: "text-amber", bg: "bg-amber-soft", Icon: MinusCircle };
  if (q.attempt.verdict === "correct") return { label: "答对", color: "text-brand", bg: "bg-brand-soft", Icon: CircleCheck };
  if (q.attempt.verdict === "partial") return { label: "部分得分", color: "text-amber", bg: "bg-amber-soft", Icon: MinusCircle };
  return { label: "答错", color: "text-accent", bg: "bg-accent-soft", Icon: CircleX };
}

function ReviewQuestion({ q, retry }: { q: QuestionPublic; retry: boolean }) {
  const st = statusOf(q);
  const selected = q.attempt?.answer || "";
  const reveal = q.reveal;
  const correctAnswer = reveal?.answer || "";
  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-[11px] font-medium text-muted">第 {q.number} 题</span>
        <Badge className={TYPE_COLOR[q.type] || "bg-subtle text-muted"}>{typeLabel(q.type)}</Badge>
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]", st.bg, st.color)}>
          <st.Icon className="h-3 w-3" /> {st.label}
        </span>
        <span className="text-[10px] text-muted">{q.chapter}</span>
        <span className="ml-auto text-[10px] text-muted">
          {q.attempt ? `${q.attempt.score ?? 0} / ${q.attempt.maxScore ?? q.score}` : `${q.score} 分`}
        </span>
      </div>
      <div className="p-4">
        <Markdown className="text-[14px] leading-7">{q.stem}</Markdown>
        {q.options.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {q.options.map(o => {
              const isCorrect = correctAnswer.includes(o.key);
              const picked = selected.includes(o.key);
              return (
                <div key={o.key} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-[12.5px]",
                  isCorrect ? "border-brand/30 bg-brand-soft/50" : picked ? "border-accent/30 bg-accent-soft/50" : "border-line bg-surface-2")}>
                  <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border text-[10px] font-medium",
                    isCorrect ? "border-brand bg-brand text-paper" : picked ? "border-accent bg-accent text-paper" : "border-line-strong text-muted")}>{o.key}</span>
                  <Markdown className="min-w-0 flex-1 text-[12.5px] leading-6">{o.text}</Markdown>
                  {picked && <span className="text-[9px] text-muted">你选</span>}
                </div>
              );
            })}
          </div>
        )}
        {q.attempt && (
          <div className="mt-3 rounded-lg bg-sand px-3 py-2">
            <div className="text-[9px] uppercase tracking-[0.14em] text-muted">你的作答</div>
            <div className="mt-1 whitespace-pre-wrap text-[12px] leading-6 text-ink">{q.attempt.answer || "（空）"}</div>
          </div>
        )}
        {q.attempt?.feedback?.summary && (
          <p className="mt-2 text-[11px] leading-5 text-muted">{q.attempt.feedback.summary}</p>
        )}
        {reveal && (
          <details className="group mt-3 rounded-lg border border-line">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-[11px] font-medium">
              答案与解析
              <ChevronDown className="h-3.5 w-3.5 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-line px-3 py-3">
              <div className="text-[11px] text-muted">标准答案：<span className="font-medium text-ink">{reveal.answer}</span></div>
              {reveal.explanation && <Markdown className="mt-2 text-[12.5px] leading-6">{reveal.explanation}</Markdown>}
            </div>
          </details>
        )}
        {retry && (
          <div className="mt-3 text-right">
            <Link href={`/practice/${q.paperId}?q=${q.id}`} className="text-[10px] text-muted hover:text-ink">回到题目 →</Link>
          </div>
        )}
      </div>
    </div>
  );
}
