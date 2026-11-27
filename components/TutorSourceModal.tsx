"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Check, Copy, X } from "lucide-react";
import type { TutorSource, TutorSourceType } from "@/lib/types";

const TYPE_LABEL: Record<TutorSourceType, string> = {
  bank: "题库",
  knowledge: "知识点",
  syllabus: "大纲",
};

const ACTION_LABEL: Record<TutorSourceType, string> = {
  bank: "查看这一年的真题",
  knowledge: "打开知识点",
  syllabus: "查看大纲",
};

export function TutorSourceModal({ source, onClose }: { source: TutorSource | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!source) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [source, onClose]);

  useEffect(() => { setCopied(false); }, [source?.ref]);

  if (!source) return null;

  const detail = source.detail && source.detail !== source.excerpt ? source.detail : "";
  const citeText = `[${source.num}] ${source.title}${source.meta ? ` · ${source.meta}` : ""}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(citeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`参考资料 ${source.num}`}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-[#1f1d19]/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[82vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-paper-2 shadow-2xl sm:max-w-[460px] sm:rounded-2xl"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start gap-2 border-b border-line px-4 py-3">
          <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-brand-soft px-1 text-[10px] font-medium text-brand">
            {source.num}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-faint">
              <span className="rounded bg-subtle px-1.5 py-0.5 text-[8.5px] normal-case tracking-normal text-muted">{TYPE_LABEL[source.type]}</span>
              {source.meta}
            </div>
            <h3 className="mt-1 font-serif text-[15px] leading-snug text-ink">{source.title}</h3>
          </div>
          <button onClick={onClose} aria-label="关闭" className="rounded-full p-1 text-muted hover:bg-hover hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          <p className="border-l-2 border-brand/30 pl-2.5 text-[11.5px] leading-6 text-ink">{source.excerpt}</p>
          {detail && (
            <div className="mt-3 rounded-lg border border-line bg-surface px-3 py-2 text-[10.5px] leading-5 text-muted whitespace-pre-wrap">
              {detail}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line bg-sand px-4 py-2.5">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[9.5px] text-muted hover:bg-hover hover:text-ink"
          >
            {copied ? <Check className="h-3 w-3 text-brand" /> : <Copy className="h-3 w-3" />}
            {copied ? "已复制" : "复制引用"}
          </button>
          {source.url && (
            <a
              href={source.url}
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[10px] text-ink hover:border-line-strong"
            >
              {ACTION_LABEL[source.type]} <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
