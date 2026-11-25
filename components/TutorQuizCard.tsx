"use client";

import { useState } from "react";
import { Check, CheckCircle2, Loader2, X } from "lucide-react";
import type { TutorMessage, TutorQuizPublic } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Markdown } from "./Markdown";

export function TutorQuizCard({
  quiz, onUpdated, onAnswered, readOnly = false,
}: {
  quiz: TutorQuizPublic;
  onUpdated: (quiz: TutorQuizPublic) => void;
  onAnswered?: (quiz: TutorQuizPublic, systemMessage?: TutorMessage) => void;
  readOnly?: boolean;
}) {
  const [local, setLocal] = useState(quiz);
  const [selected, setSelected] = useState(quiz.attempt?.answer || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempted = !!local.attempt;

  async function submit() {
    if (!selected || busy || attempted || readOnly) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/tutor/quiz/${local.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer: selected }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "提交失败");
      setLocal(data.quiz);
      onUpdated(data.quiz);
      if (data.quiz?.attempt) onAnswered?.(data.quiz, data.systemMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-brand/20 bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line bg-brand-soft/40 px-3.5 py-2">
        <span className="text-[9px] font-medium uppercase tracking-[0.14em] text-brand">巩固题 · {local.difficulty}</span>
        <span className="text-[9px] text-muted">{local.topic || local.chapter}</span>
      </div>
      <div className="p-3.5">
        <Markdown className="text-[13px] leading-6">{local.stem}</Markdown>
        <div className="mt-3 space-y-1.5">
          {local.options.map(option => {
            const isSelected = selected === option.key;
            const isCorrect = attempted && local.answer === option.key;
            const isWrongPick = attempted && isSelected && local.answer !== option.key;
            return (
              <button
                key={option.key}
                onClick={() => !attempted && setSelected(option.key)}
                disabled={attempted || busy || readOnly}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg border px-2.5 py-2 text-left text-[12px] leading-5 transition-colors",
                  !attempted && "hover:border-line-strong hover:bg-surface-2",
                  isSelected && !attempted && "border-brand bg-brand-soft/50",
                  isCorrect && "border-brand/50 bg-brand-soft/60",
                  isWrongPick && "border-accent/50 bg-accent-soft/60",
                  attempted && !isCorrect && !isWrongPick && "border-line opacity-60"
                )}
              >
                <span className={cn(
                  "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[10px] font-medium",
                  isSelected && !attempted ? "border-brand bg-brand text-paper" : "border-line-strong bg-surface-2 text-muted",
                  isCorrect && "border-brand bg-brand text-paper",
                  isWrongPick && "border-accent bg-accent text-paper"
                )}>
                  {isCorrect ? <Check className="h-3 w-3" /> : isWrongPick ? <X className="h-3 w-3" /> : option.key}
                </span>
                <Markdown className="min-w-0 flex-1">{option.text}</Markdown>
              </button>
            );
          })}
        </div>

        {!attempted ? (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={submit}
              disabled={!selected || busy || readOnly}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[11px] font-medium text-paper disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
              提交答案
            </button>
            <span className="text-[9px] text-faint">{readOnly ? "此对话已归档" : "作答后老师会接着讲"}</span>
          </div>
        ) : (
          <div className="mt-3 rounded-lg border border-line bg-surface-2 p-2.5">
            <div className={cn("flex items-center gap-1.5 text-[11px] font-medium", local.attempt?.correct ? "text-brand" : "text-accent")}>
              <CheckCircle2 className="h-3.5 w-3.5" />
              {local.attempt?.correct ? "答对了" : `答错了，正确答案 ${local.answer}`}
            </div>
            {local.explanation && <Markdown className="mt-1.5 text-[11px] leading-5 text-muted">{local.explanation}</Markdown>}
          </div>
        )}
        {error && <p className="mt-2 text-[10px] text-accent">{error}</p>}
      </div>
    </div>
  );
}
