"use client";

import { ChevronRight, ShieldAlert } from "lucide-react";
import type { TutorMessage } from "@/lib/types";
import { Markdown } from "./Markdown";

function reviewBody(critique: string) {
  return critique.replace(/^REVISE\b[：:]?\s*/i, "").trim();
}

function draftText(draft?: TutorMessage) {
  if (!draft) return "";
  if (draft.content) return draft.content.replace(/\[\[S\d+\]\]/g, "");
  if (draft.quiz) return draft.quiz.stem;
  if (draft.check) return draft.check.prompt;
  return "";
}

/**
 * The teacher's rejected draft and the supervisor's one-line review. Collapsed
 * by default so the delivered answer stays the focus; students can look at what
 * was sent back if they are curious.
 */
export function TutorSupervisionCard({
  critique, draft,
}: {
  critique: string;
  draft?: TutorMessage;
}) {
  const text = reviewBody(critique);
  const rejected = draftText(draft);

  return (
    <details className="group mt-3 rounded-xl border border-line bg-surface-2/70">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[9.5px] text-faint transition-colors hover:text-muted [&::-webkit-details-marker]:hidden">
        <ShieldAlert className="h-3 w-3 shrink-0 text-amber" />
        督导退回了一版
        <ChevronRight className="h-3 w-3 shrink-0 transition-transform group-open:rotate-90" />
      </summary>
      <div className="px-3 pb-2.5">
        <div className="border-l-2 border-amber/40 pl-2.5">
          <Markdown className="text-[11px] leading-5 text-ink">{text}</Markdown>
        </div>
        {rejected && (
          <details className="mt-2">
            <summary className="cursor-pointer list-none text-[9px] text-faint hover:text-muted [&::-webkit-details-marker]:hidden">
              查看被退回的版本
            </summary>
            <div className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-line bg-surface px-2.5 py-2 text-[10.5px] leading-5 text-muted">
              {rejected}
            </div>
          </details>
        )}
      </div>
    </details>
  );
}
