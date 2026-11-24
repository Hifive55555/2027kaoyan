"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Clock3, Layers, Sparkles, X, AlertCircle } from "lucide-react";
import type { SubjectConfig, SubjectId, SubjectChapter } from "@/lib/types";
import { subjectTint } from "@/lib/subjects";
import { SubjectIcon } from "./SubjectIcon";
import { Button, Card, Spinner } from "./ui";
import { cn } from "@/lib/utils";

const DEFAULT_CHAPTER: Record<SubjectId, string> = {
  math2: "math2-diff",
  english2: "english2-reading",
  politics: "politics-mayuan",
  cs408: "cs408-ds",
};

const LOADING_STEPS = [
  "检索 2027 大纲与历年真题…",
  "设计题型结构与分值…",
  "编写题干与干扰项…",
  "校验答案与解析…",
  "整理成卷…",
];

function flatten(chapters: SubjectChapter[]): SubjectChapter[] {
  const out: SubjectChapter[] = [];
  for (const c of chapters) { out.push(c); if (c.children) out.push(...c.children); }
  return out;
}

export function PracticeSetup({ subjects, initialSubject, initialChapter }: {
  subjects: SubjectConfig[];
  initialSubject: SubjectId;
  initialChapter?: string;
}) {
  const router = useRouter();
  const [subjectId, setSubjectId] = useState<SubjectId>(initialSubject);
  const subject = subjects.find(s => s.id === subjectId)!;
  const [selected, setSelected] = useState<Set<string>>(() => {
    const s = subjects.find(x => x.id === initialSubject)!;
    const valid = initialChapter && flatten(s.chapters).some(c => c.id === initialChapter);
    return new Set([valid ? initialChapter! : DEFAULT_CHAPTER[initialSubject]]);
  });
  const [modeId, setModeId] = useState(subject.modes[0].id);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const mode = subject.modes.find(m => m.id === modeId) || subject.modes[0];

  const totalCount = mode.plan.reduce((s, p) => s + p.count, 0);
  const totalScore = mode.plan.reduce((sum, p) => {
    let unit = p.score;
    if (!unit) {
      if (subject.id === "math2" && p.type === "solution") unit = p.count >= 6 ? 70 / p.count : 10;
      else if (subject.id === "english2" && p.type === "writing") unit = p.count >= 2 ? 25 / p.count : 15;
      else unit = 10;
    }
    return sum + p.count * unit;
  }, 0);

  const selectedNames = useMemo(() => {
    const flat = flatten(subject.chapters);
    return [...selected].map(id => flat.find(c => c.id === id)?.name).filter(Boolean) as string[];
  }, [selected, subject]);

  function changeSubject(id: SubjectId) {
    const next = subjects.find(s => s.id === id)!;
    setSubjectId(id);
    setSelected(new Set([DEFAULT_CHAPTER[id]]));
    setModeId(next.modes[0].id);
    setError("");
  }

  function toggleChapter(c: SubjectChapter) {
    setSelected(prev => {
      const next = new Set(prev);
      const ids = c.children ? [c.id, ...c.children.map(x => x.id)] : [c.id];
      const allSelected = ids.every(id => next.has(id));
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      if (!next.size) next.add(c.id);
      return next;
    });
  }

  async function start() {
    if (!selected.size) return;
    setLoading(true);
    setError("");
    setElapsed(0);
    setStep(0);
    const controller = new AbortController();
    abortRef.current = controller;
    const t0 = Date.now();
    const timer = setInterval(() => {
      const sec = Math.floor((Date.now() - t0) / 1000);
      setElapsed(sec);
      setStep(Math.min(LOADING_STEPS.length - 1, Math.floor(sec / 5)));
    }, 1000);
    try {
      const res = await fetch("/api/papers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: subjectId, chapterIds: [...selected], mode: modeId }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      router.push(`/practice/${data.paperId}`);
    } catch (err) {
      if (err && typeof err === "object" && "name" in err && (err as { name?: string }).name === "AbortError") return;
      setError(err instanceof Error ? err.message : "生成失败");
      setLoading(false);
    } finally {
      clearInterval(timer);
      abortRef.current = null;
    }
  }

  return (
    <div className="mx-auto max-w-[1080px] px-5 py-8 lg:px-10 lg:py-12">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">Practice builder</div>
      <h1 className="mt-3 font-serif text-[30px] leading-tight tracking-tight sm:text-[36px]">组一套题</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
        选科目、章节和练习量。程序会调用模型按 2027 大纲现编，并在你提交后逐题批改。
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {subjects.map(s => (
          <button key={s.id} onClick={() => changeSubject(s.id)} className={cn(
            "group rounded-xl border p-4 text-left transition-all",
            s.id === subjectId ? "border-line-strong bg-surface shadow-[0_4px_16px_rgba(60,50,30,0.05)]" : "border-line bg-surface-2 hover:border-line-strong"
          )}>
            <div className="flex items-center justify-between">
              <span className="grid h-8 w-8 place-items-center rounded-lg" style={subjectTint(s.accent)}>
                <SubjectIcon id={s.id} className="h-4 w-4" />
              </span>
              {s.id === subjectId && <span className="grid h-4 w-4 place-items-center rounded-full bg-brand text-paper"><Check className="h-2.5 w-2.5" /></span>}
            </div>
            <div className="mt-3 text-[13px] font-medium text-ink">{s.name}</div>
            <div className="mt-0.5 text-[10px] text-muted">{s.code} · {s.totalScore} 分</div>
          </button>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <div className="space-y-6">
          <Card className="p-5 sm:p-6">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-serif text-lg"><Layers className="h-4 w-4 text-brand" /> 选择章节</h2>
              <span className="text-[11px] text-muted">已选 {selected.size} 个</span>
            </div>
            <div className="mt-4 space-y-3">
              {subject.chapters.map(parent => {
                const children = parent.children || [];
                const ids = children.length ? [parent.id, ...children.map(c => c.id)] : [parent.id];
                const all = ids.every(id => selected.has(id));
                const some = ids.some(id => selected.has(id));
                return (
                  <div key={parent.id} className={cn("rounded-xl border p-3.5 transition-colors", some ? "border-line-strong bg-surface-2" : "border-line bg-surface")}>
                    <button onClick={() => toggleChapter(parent)} className="flex w-full items-center gap-3 text-left">
                      <span className={cn("grid h-5 w-5 place-items-center rounded-md border", all ? "border-brand bg-brand text-paper" : some ? "border-brand/50 bg-brand-soft" : "border-line-strong bg-surface")}>
                        {all ? <Check className="h-3 w-3" /> : some ? <span className="h-1.5 w-1.5 rounded-sm bg-brand" /> : null}
                      </span>
                      <span className="text-[13px] font-medium text-ink">{parent.name}</span>
                      <span className="ml-auto text-[10px] text-muted">{children.length ? `${children.length} 个专题` : "专题"}</span>
                    </button>
                    {children.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5 pl-8">
                        {children.map(child => {
                          const on = selected.has(child.id);
                          return (
                            <button key={child.id} onClick={() => setSelected(prev => {
                              const next = new Set(prev);
                              next.delete(parent.id);
                              if (next.has(child.id)) next.delete(child.id); else next.add(child.id);
                              if (!next.size) next.add(child.id);
                              return next;
                            })} className={cn(
                              "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                              on ? "border-brand/30 bg-brand-soft text-brand" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
                            )}>
                              {child.name}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-serif text-lg"><Sparkles className="h-4 w-4 text-accent" /> 练习模式</h2>
            <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
              {subject.modes.map(m => {
                const count = m.plan.reduce((s, p) => s + p.count, 0);
                const active = m.id === modeId;
                return (
                  <button key={m.id} onClick={() => setModeId(m.id)} className={cn(
                    "rounded-xl border p-3.5 text-left transition-all",
                    active ? "border-line-strong bg-surface-2" : "border-line bg-surface hover:border-line-strong"
                  )}>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium text-ink">{m.name}</span>
                      <span className={cn("grid h-4 w-4 place-items-center rounded-full border", active ? "border-brand bg-brand text-paper" : "border-line-strong")}>
                        {active && <Check className="h-2.5 w-2.5" />}
                      </span>
                    </div>
                    <div className="mt-1 text-[11px] leading-5 text-muted">{m.description}</div>
                    <div className="mt-2 flex items-center gap-3 text-[10px] text-faint">
                      <span>{count} 题</span><span>·</span><span>{m.minutes} 分钟</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="sticky top-6 p-5 sm:p-6">
            <div className="text-[10px] uppercase tracking-[0.16em] text-muted">本次练习</div>
            <h3 className="mt-2 font-serif text-xl leading-snug">{subject.short} · {selectedNames[0] || "综合"}</h3>
            <p className="mt-1 text-[11px] leading-5 text-muted">{selectedNames.join("、") || "请选择章节"}</p>

            <div className="mt-5 space-y-3 border-t border-line pt-4 text-[12px]">
              <div className="flex items-center justify-between"><span className="text-muted">题型</span><span className="text-ink">{mode.plan.map(p => `${p.name} ${p.count}`).join(" · ")}</span></div>
              <div className="flex items-center justify-between"><span className="text-muted">题量</span><span className="font-medium text-ink">{totalCount} 题</span></div>
              {(subject.id === "politics" || subject.id === "cs408") && <p className="text-[10px] leading-5 text-faint">分析题 / 综合题会按小问拆分逐条批改，实际条目可能略多。</p>}
              <div className="flex items-center justify-between"><span className="text-muted">建议用时</span><span className="inline-flex items-center gap-1 text-ink"><Clock3 className="h-3.5 w-3.5 text-muted" /> {mode.minutes} 分钟</span></div>
              <div className="flex items-center justify-between"><span className="text-muted">参考总分</span><span className="text-ink">{totalScore} 分</span></div>
            </div>

            <div className="mt-5 rounded-lg bg-sand px-3 py-2.5 text-[10px] leading-5 text-muted">
              按 2027 大纲生成，题目原创。生成后不显示答案，提交批改才揭晓。
            </div>

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-[11px] leading-5 text-accent">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
              </div>
            )}

            <Button size="lg" className="mt-5 w-full" onClick={start} disabled={loading || !selected.size}>
              {loading ? <Spinner className="text-paper" /> : <Sparkles className="h-4 w-4" />}
              {loading ? "正在命题…" : "生成这份练习"}
            </Button>
            <div className="mt-2 text-center text-[10px] text-faint">通常 20—60 秒；408 / 整卷可能更久</div>
          </Card>
        </div>
      </div>

      {loading && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#1f1d19]/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line-strong bg-surface-2 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted">Composing</div>
              <button onClick={() => { abortRef.current?.abort(); setLoading(false); }} className="rounded-full p-1 text-muted hover:bg-hover hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <div className="mt-4 font-serif text-xl">正在为你组卷</div>
            <div className="mt-1 text-[11px] text-muted">已用 {elapsed} 秒 · 题量 {totalCount}</div>
            <div className="mt-6 space-y-3">
              {LOADING_STEPS.map((s, i) => (
                <div key={s} className={cn("flex items-center gap-3 text-[12px]", i < step ? "text-muted" : i === step ? "text-ink" : "text-faint")}>
                  <span className={cn("grid h-5 w-5 place-items-center rounded-full border text-[9px]", i < step ? "border-brand bg-brand text-paper" : i === step ? "border-brand text-brand" : "border-line")}>
                    {i < step ? <Check className="h-2.5 w-2.5" /> : i + 1}
                  </span>
                  {s}
                  {i === step && <span className="ml-auto h-1.5 w-1.5 animate-soft-pulse rounded-full bg-accent" />}
                </div>
              ))}
            </div>
            <div className="mt-6 h-1 overflow-hidden rounded-full bg-track">
              <div className="h-full rounded-full bg-brand transition-all duration-1000" style={{ width: `${Math.min(94, 10 + elapsed * 2.2)}%` }} />
            </div>
            <p className="mt-4 text-[10px] leading-5 text-faint">
              整卷模式题量较大，可能需要 1—3 分钟。请不要关闭页面；若失败可直接重试。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
