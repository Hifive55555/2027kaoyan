"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { TutorSource, TutorSourceType } from "@/lib/types";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<TutorSourceType, string> = {
  bank: "题库",
  knowledge: "知识点",
  syllabus: "大纲",
};

export function TutorSources({
  sources, uncited, onOpen,
}: {
  sources: TutorSource[];
  uncited?: number;
  onOpen: (source: TutorSource) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  const counts = sources.reduce<Partial<Record<TutorSourceType, number>>>((acc, source) => {
    acc[source.type] = (acc[source.type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-md text-[9.5px] leading-4 text-faint transition-colors hover:text-muted"
      >
        <span>参考资料 {sources.length}</span>
        <span className="text-faint/90">
          {Object.entries(counts).map(([type, count]) => `${TYPE_LABEL[type as TutorSourceType]} ${count}`).join(" · ")}
        </span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <ul className="mt-1.5 space-y-1">
          {sources.map(source => (
            <li key={source.ref}>
              <button
                type="button"
                onClick={() => onOpen(source)}
                className="flex w-full items-start gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-left transition-colors hover:border-line-strong hover:bg-hover"
              >
                <span className="mt-[1px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded bg-brand-soft text-[9px] font-medium text-brand">
                  {source.num}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-1.5">
                    <span className="shrink-0 rounded bg-subtle px-1 py-0.5 text-[8.5px] leading-none text-muted">{TYPE_LABEL[source.type]}</span>
                    <span className="truncate text-[10px] leading-4 text-ink">{source.title}</span>
                    <span className="ml-auto shrink-0 text-[9px] text-faint">{source.meta}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[9.5px] leading-4 text-muted">{source.excerpt}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {uncited ? (
        <p className="mt-1 text-[9px] leading-4 text-faint">另有 {uncited} 条检索结果未直接引用</p>
      ) : null}
    </div>
  );
}
