"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, ChevronRight, Dices, Loader2, MessageCircle, RefreshCw, X } from "lucide-react";
import { Markdown } from "./Markdown";
import { ThemeToggle } from "./ThemeToggle";
import { ChatPanel } from "./ChatPanel";
import { cn } from "@/lib/utils";
import type { QuestionPublic } from "@/lib/types";

type RQ = {
  id: string;
  subject: string;
  subjectName: string;
  year: number;
  number: number;
  type: string;
  chapter: string;
  topic: string;
  difficulty: string;
  generated?: boolean;
  stem: string;
  options: { key: string; text: string }[];
};

type RResult = { correct: boolean; answer: string; explanation: string; topic: string; chapter: string };

const SUBJECT_STYLE: Record<string, string> = {
  math2: "bg-brand-soft text-brand",
  english2: "bg-amber-soft text-amber",
  politics: "bg-accent-soft text-accent",
  cs408: "bg-blue-soft text-blue",
};

export function RandomClient({ initial, initialStats, displayName }: {
  initial: RQ;
  initialStats: { total: number; correct: number; accuracy: number };
  displayName: string;
}) {
  const [current, setCurrent] = useState<RQ>(initial);
  const [next, setNext] = useState<RQ | null>(null);
  const [selected, setSelected] = useState("");
  const [result, setResult] = useState<RResult | null>(null);
  const [stats, setStats] = useState(initialStats);
  const [session, setSession] = useState({ total: 0, correct: 0 });
  const [loading, setLoading] = useState(false);
  const [loadingNext, setLoadingNext] = useState(false);
  const [error, setError] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const prefetching = useRef(false);

  const fetchNext = useCallback(async (exclude?: string): Promise<RQ | null> => {
    try {
      const res = await fetch(`/api/random/next${exclude ? `?exclude=${encodeURIComponent(exclude)}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "取题失败");
      return data.question as RQ;
    } catch (err) {
      setError(err instanceof Error ? err.message : "取题失败");
      return null;
    }
  }, []);

  useEffect(() => {
    if (next || prefetching.current) return;
    prefetching.current = true;
    fetchNext(current.id).then(q => {
      if (q) setNext(q);
      prefetching.current = false;
    });
  }, [current.id, next, fetchNext]);

  async function choose(key: string) {
    if (result || loading) return;
    setSelected(key);
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/random/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: current.id, answer: key }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "批改失败");
      setResult(data);
      setStats(s => ({
        total: s.total + 1,
        correct: s.correct + (data.correct ? 1 : 0),
        accuracy: Math.round(((s.correct + (data.correct ? 1 : 0)) / (s.total + 1)) * 100),
      }));
      setSession(s => ({ total: s.total + 1, correct: s.correct + (data.correct ? 1 : 0) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "批改失败");
      setSelected("");
    } finally {
      setLoading(false);
    }
  }

  async function advance(skip = false) {
    if (loadingNext) return;
    setLoadingNext(true);
    setError("");
    try {
      let q = next;
      if (!q || skip) q = await fetchNext(current.id);
      if (!q) return;
      setCurrent(q);
      setNext(null);
      setSelected("");
      setResult(null);
      setChatOpen(false);
    } finally {
      setLoadingNext(false);
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (chatOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      if (result) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); advance(); }
        return;
      }
      const map: Record<string, string> = { "1": "A", "2": "B", "3": "C", "4": "D", a: "A", b: "B", c: "C", d: "D" };
      const key = map[e.key.toLowerCase()];
      if (key) { e.preventDefault(); choose(key); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const correct = result?.correct;
  const sessionAcc = session.total ? Math.round((session.correct / session.total) * 100) : 0;
  const chatQuestion: QuestionPublic = {
    id: current.id,
    paperId: "random",
    sectionId: "",
    number: current.number,
    type: current.type as QuestionPublic["type"],
    stem: current.stem,
    options: current.options,
    score: 0,
    difficulty: current.difficulty,
    topic: current.topic,
    chapter: current.chapter,
    sourceNote: "随机题库",
    attempt: null,
    revealed: !!result,
    reveal: result ? { answer: result.answer, explanation: result.explanation } : undefined,
  };

  return (
    <main className="min-h-screen bg-paper pb-14">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[980px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="返回首页" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-brand-soft text-brand"><Dices className="h-4 w-4" /></span>
            <div>
              <div className="font-serif text-[15px] leading-4">随机刷题</div>
              <div className="text-[9px] text-faint">题库检索 + AI 缓冲 · 点选项即判</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 text-[10px] text-muted">
            <span className="hidden rounded-full bg-surface-2 px-2.5 py-1 sm:inline">本次 {session.correct}/{session.total} · {sessionAcc}%</span>
            <span className="hidden rounded-full bg-surface-2 px-2.5 py-1 sm:inline">累计 {stats.correct}/{stats.total} · {stats.accuracy}%</span>
            <span className="hidden text-faint md:inline">{displayName}</span>
            <ThemeToggle compact />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[760px] px-4 pt-6 sm:px-6 sm:pt-10">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] text-faint">
            <span className={cn("rounded-full px-2.5 py-1", SUBJECT_STYLE[current.subject] || "bg-surface-2 text-muted")}>
              {current.subjectName}
            </span>
            <span>{current.year ? `${current.year} 年 · 第 ${current.number} 题` : current.generated ? `AI 生成 · ${current.difficulty}` : current.difficulty}</span>
            <span className="hidden sm:inline">· {current.chapter}</span>
          </div>
          <button onClick={() => advance(true)} disabled={loadingNext || !!result} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] text-faint hover:bg-hover hover:text-ink disabled:opacity-30">
            <RefreshCw className={cn("h-3 w-3", loadingNext && "animate-spin")} /> 换一题
          </button>
        </div>

        <section className="rounded-2xl border border-line bg-surface p-5 shadow-[0_12px_40px_rgba(60,50,30,0.05)] sm:p-8">
          <Markdown className="text-[16px] leading-[1.95] sm:text-[17px]">{current.stem}</Markdown>

          <div className="mt-6 space-y-2.5">
            {current.options.map(o => {
              const picked = selected === o.key;
              const isAnswer = result?.answer === o.key;
              return (
                <button
                  key={o.key}
                  onClick={() => choose(o.key)}
                  disabled={!!result || loading}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3.5 text-left transition-all sm:px-4",
                    !result && "border-line bg-paper-2 hover:border-line-strong hover:bg-surface-2",
                    !result && picked && "border-brand bg-brand-soft/60",
                    result && isAnswer && "border-brand/50 bg-brand-soft/70",
                    result && picked && !isAnswer && "border-accent/40 bg-accent-soft/60",
                    result && !isAnswer && !picked && "border-line bg-surface opacity-55"
                  )}
                >
                  <span className={cn(
                    "mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-[11px] font-semibold",
                    picked && !result ? "border-brand bg-brand text-paper" : "border-line-strong bg-surface text-muted",
                    result && isAnswer && "border-brand bg-brand text-paper",
                    result && picked && !isAnswer && "border-accent bg-accent text-paper"
                  )}>
                    {result && isAnswer ? <Check className="h-3.5 w-3.5" /> : result && picked && !isAnswer ? <X className="h-3.5 w-3.5" /> : o.key}
                  </span>
                  <Markdown className="min-w-0 flex-1 text-[14px] leading-6">{o.text}</Markdown>
                </button>
              );
            })}
          </div>

          {error && <div className="mt-4 rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-[11px] text-accent">{error}</div>}

          {!result && (
            <div className="mt-5 flex items-center justify-between text-[10px] text-faint">
              <span>{loading ? "判分中…" : "点击选项立即判分 · 键盘 1—4 / A—D"}</span>
              <span className="hidden sm:inline">答错也没关系，看完解析再下一题</span>
            </div>
          )}

          {result && (
            <div className="mt-5 animate-rise rounded-xl border border-line bg-paper-2 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", correct ? "bg-brand-soft text-brand" : "bg-accent-soft text-accent")}>
                  {correct ? "答对了" : "答错了"}
                </span>
                <span className="text-[10px] text-muted">正确答案：<b className="text-ink">{result.answer}</b></span>
                <span className="text-[10px] text-muted">· {result.chapter}</span>
              </div>
              {result.explanation && (
                <div className="mt-3 border-t border-line pt-3">
                  <Markdown className="text-[12.5px] leading-6">{result.explanation}</Markdown>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={() => advance()} disabled={loadingNext} className="inline-flex h-10 items-center gap-2 rounded-lg bg-ink px-4 text-[12px] font-medium text-paper disabled:opacity-40">
                  {loadingNext ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  下一题 <ChevronRight className="h-4 w-4" />
                </button>
                <button onClick={() => setChatOpen(true)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-[12px] text-muted hover:border-line-strong hover:text-ink">
                  <MessageCircle className="h-3.5 w-3.5" /> 追问
                </button>
                <span className="text-[10px] text-faint">Enter 继续</span>
              </div>
            </div>
          )}
        </section>

        <div className="mt-4 flex items-center justify-between text-[10px] text-faint">
          <span>题库检索 + AI 预生成，答案已隐藏</span>
          <span>{current.topic || ""}</span>
        </div>
      </div>

      <ChatPanel
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        question={chatQuestion}
        reveal={result ? { answer: result.answer, explanation: result.explanation } : undefined}
        apiPath="/api/random/chat"
      />
    </main>
  );
}
