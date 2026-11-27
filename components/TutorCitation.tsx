"use client";

import { useRef, useState } from "react";
import type { TutorSource, TutorSourceType } from "@/lib/types";

const TYPE_LABEL: Record<TutorSourceType, string> = {
  bank: "题库",
  knowledge: "知识点",
  syllabus: "大纲",
};

/**
 * Superscript citation chip. Hover/focus shows a compact preview on pointer
 * devices; click (or tap) opens the full source modal. The preview flips below
 * the chip when there is no room above it.
 */
export function TutorCitation({
  source, label, onOpen,
}: {
  source: TutorSource;
  label: React.ReactNode;
  onOpen: () => void;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [below, setBelow] = useState(false);

  function place() {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    // Measure against the chat scroller, not the window: the preview must not
    // be clipped by the message area just because it is near the page top.
    const scroller = el.closest('[data-chat-scroll]') as HTMLElement | null;
    const top = scroller ? scroller.getBoundingClientRect().top : 0;
    setBelow(rect.top - top < 200);
  }

  return (
    <span ref={anchorRef} className="group/cite relative inline-block align-baseline">
      <button
        type="button"
        onClick={onOpen}
        onMouseEnter={place}
        onFocus={place}
        aria-label={`查看引用 ${label}`}
        className="mx-0.5 inline-flex h-[15px] min-w-[15px] -translate-y-1 items-center justify-center rounded-[4px] border border-brand/25 bg-brand-soft/60 px-1 align-baseline text-[9.5px] font-medium leading-none text-brand transition-colors hover:border-brand/50 hover:bg-brand-soft focus-visible:border-brand/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
      >
        {label}
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-30 hidden w-[248px] -translate-x-1/2 rounded-xl border border-line bg-paper-2 p-2.5 text-left shadow-[0_10px_30px_rgba(31,29,25,0.14)] group-hover/cite:block group-focus-within/cite:block ${
          below ? "top-full mt-1.5" : "bottom-full mb-1.5"
        }`}
      >
        <span className="flex items-center gap-1.5 text-[8.5px] uppercase tracking-[0.1em] text-faint">
          <span className="rounded bg-subtle px-1.5 py-0.5 text-[8px] normal-case tracking-normal text-muted">{TYPE_LABEL[source.type]}</span>
          {source.meta}
        </span>
        <span className="mt-1 block text-[10.5px] font-medium leading-4 text-ink">{source.title}</span>
        <span className="mt-1 line-clamp-2 block text-[9.5px] leading-4 text-muted">{source.excerpt}</span>
        <span className="mt-1.5 block text-[8.5px] text-faint">点击查看完整来源</span>
      </span>
    </span>
  );
}
