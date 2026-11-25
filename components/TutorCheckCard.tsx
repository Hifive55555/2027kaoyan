"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import type { TutorCheckPublic, TutorMessage } from "@/lib/types";
import { Markdown } from "./Markdown";

export function TutorCheckCard({
  check, onUpdated, onAnswered, readOnly = false,
}: {
  check: TutorCheckPublic;
  onUpdated: (check: TutorCheckPublic) => void;
  onAnswered?: (check: TutorCheckPublic, systemMessage?: TutorMessage) => void;
  readOnly?: boolean;
}) {
  const [local, setLocal] = useState(check);
  const [value, setValue] = useState(check.attempt?.response || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const attempted = !!local.attempt;

  async function submit(response: string) {
    const answer = response.trim();
    if (!answer || busy || attempted || readOnly) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/tutor/check/${local.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "提交失败");
      setLocal(data.check);
      onUpdated(data.check);
      onAnswered?.(data.check, data.systemMessage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-blue/20 bg-blue-soft/30">
      <div className="border-b border-blue/15 px-3.5 py-2 text-[9px] font-medium uppercase tracking-[0.14em] text-blue">
        快速检查 · {local.kind === "fill" ? "填空" : "判断"}
      </div>
      <div className="p-3.5">
        <Markdown className="text-[13px] leading-6">{local.prompt}</Markdown>

        {attempted ? (
          <div className="mt-2.5 flex items-start gap-1.5 rounded-lg border border-brand/15 bg-surface/70 px-2.5 py-2 text-[10px] leading-5 text-muted">
            <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-brand" />
            <span>已提交：<b className="text-ink">{local.attempt?.response}</b></span>
          </div>
        ) : local.kind === "yesno" ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {local.options.map(option => (
              <button
                key={option}
                onClick={() => submit(option)}
                disabled={busy || readOnly}
                className="h-8 rounded-lg border border-line bg-surface px-3 text-[11px] text-muted transition-colors hover:border-brand/50 hover:bg-brand-soft/40 hover:text-ink disabled:opacity-50"
              >
                {option}
              </button>
            ))}
            {busy && <Loader2 className="mt-2 h-3.5 w-3.5 animate-spin text-brand" />}
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-2">
            <input
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(value); } }}
              disabled={readOnly}
              placeholder={readOnly ? "此对话已归档" : (local.placeholder || "填写你的答案")}
              className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[11px] outline-none placeholder:text-faint focus:border-brand/50"
            />
            <button
              onClick={() => submit(value)}
              disabled={!value.trim() || busy || readOnly}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-ink px-3 text-[10px] font-medium text-paper disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              提交
            </button>
          </div>
        )}
        {readOnly && !attempted && !error && <p className="mt-2 text-[10px] text-amber">此对话已归档，取消归档后可作答。</p>}
        {error && <p className="mt-2 text-[10px] text-accent">{error}</p>}
      </div>
    </div>
  );
}
