"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Clock3, Crown, Loader2, Swords, TimerOff, Trophy, Users, X } from "lucide-react";
import { Markdown } from "./Markdown";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";

type Player = { sessionId: string; displayName: string; isGuest: boolean; score: number; currentIndex: number; finished: boolean };
type Q = { idx: number; number: number; subject: string; chapter: string; stem: string; options: { key: string; text: string }[]; timeLimit: number; score: number; difficulty: string; deadline: number };
type Review = { idx: number; subject: string; chapter: string; stem: string; options: { key: string; text: string }[]; answer: string; explanation: string; myAnswer: string; myCorrect: boolean; opponentAnswer: string; opponentCorrect: boolean };
type State = { matchId: string; status: string; startAt: number | null; serverNow: number; total: number; me: Player; opponent: Player | null; winnerSessionId: string | null; winnerName: string | null; question: Q | null; review?: Review[]; message?: string };
type Feedback = { correct?: boolean; answer?: string; explanation?: string; timeout?: boolean };

const SUBJECT_SHORT: Record<string, string> = { math2: "数二", english2: "英二", politics: "政治", cs408: "408" };
const SUBJECT_STYLE: Record<string, string> = {
  math2: "bg-brand-soft text-brand",
  english2: "bg-amber-soft text-amber",
  politics: "bg-accent-soft text-accent",
  cs408: "bg-blue-soft text-blue",
};

export function MatchClient({ matchId, displayName, isGuest }: { matchId: string; displayName: string; isGuest: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState("");
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef<State | null>(null);
  const feedbackRef = useRef(false);
  const timeoutRef = useRef("");

  function apply(next: State) {
    setState(next);
    setOffset(next.serverNow - Date.now());
    setSubmitting(false);
  }

  useEffect(() => {
    let alive = true;
    async function load() {
      if (feedbackRef.current) return;
      try {
        const res = await fetch(`/api/match/state?matchId=${encodeURIComponent(matchId)}`);
        const data = await res.json();
        if (!alive) return;
        if (res.status === 401) { router.replace("/login"); return; }
        if (!res.ok) { setError(data.error || "读取比赛失败"); return; }
        setError("");
        apply(data);
      } catch {
        if (alive) setError("网络连接中断，正在重试…");
      }
    }
    load();
    const t = setInterval(load, 1200);
    return () => { alive = false; clearInterval(t); };
  }, [matchId, router]);

  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), 250);
    return () => clearInterval(t);
  }, []);

  const q = state?.question || null;
  const now = Date.now() + offset;
  const remainMs = q ? q.deadline - now : 0;
  const remain = q ? Math.max(0, Math.ceil(remainMs / 1000)) : 0;
  const countdown = state?.startAt ? Math.max(0, Math.ceil((state.startAt - now) / 1000)) : 0;
  const pctLeft = q ? Math.max(0, Math.min(100, (remainMs / (q.timeLimit * 1000)) * 100)) : 0;

  useEffect(() => {
    if (!q || !state || state.status !== "running" || feedback || submitting) return;
    const key = `${q.idx}-${q.deadline}`;
    if (remain <= 0 && timeoutRef.current !== key) {
      timeoutRef.current = key;
      void fireTimeout();
    }
  }, [remain, q, state, feedback, submitting]);

  async function post(path: string, body: unknown) {
    const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "请求失败");
    return data;
  }

  function showFeedback(data: any) {
    pendingRef.current = data.state || null;
    feedbackRef.current = true;
    setFeedback({ correct: data.correct, answer: data.answer, explanation: data.explanation, timeout: data.timeout });
    window.setTimeout(() => {
      if (pendingRef.current) apply(pendingRef.current);
      pendingRef.current = null;
      setFeedback(null);
      setSelected("");
      feedbackRef.current = false;
    }, data.timeout ? 1200 : 1600);
  }

  async function pick(key: string) {
    if (!q || submitting || feedbackRef.current) return;
    setSelected(key);
    setSubmitting(true);
    setError("");
    try {
      const data = await post("/api/match/answer", { matchId, idx: q.idx, answer: key });
      if (data.stale && data.state) {
        apply(data.state);
        setSelected("");
        return;
      }
      showFeedback(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
      setSubmitting(false);
      setSelected("");
    }
  }

  async function fireTimeout() {
    if (!q) return;
    setSubmitting(true);
    try {
      const data = await post("/api/match/timeout", { matchId });
      if (data.state) {
        pendingRef.current = data.state;
        feedbackRef.current = true;
        setFeedback({ timeout: true });
        window.setTimeout(() => {
          if (pendingRef.current) apply(pendingRef.current);
          pendingRef.current = null;
          setFeedback(null);
          setSelected("");
          feedbackRef.current = false;
        }, 1200);
      }
    } catch (err) {
      timeoutRef.current = "";
      setError(err instanceof Error ? err.message : "计时同步失败");
      setSubmitting(false);
    }
  }

  async function cancel() {
    try {
      await post("/api/match/cancel", { matchId });
      router.push("/match");
    } catch (err) {
      setError(err instanceof Error ? err.message : "取消失败");
    }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  if (!state && !error) {
    return <main className="grid min-h-screen place-items-center bg-paper"><Loader2 className="h-6 w-6 animate-spin text-brand" /></main>;
  }

  if (error && !state) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-4">
        <div className="max-w-sm rounded-2xl border border-line bg-surface p-6 text-center">
          <p className="text-sm text-ink">{error}</p>
          <Link href="/match" className="mt-4 inline-flex rounded-lg bg-ink px-4 py-2 text-xs text-paper">返回比赛大厅</Link>
        </div>
      </main>
    );
  }

  if (!state) return null;

  const finished = state.status === "finished";
  const waitingForOpponent = state.me.finished && !finished;
  const won = state.winnerSessionId === state.me.sessionId;

  return (
    <main className="min-h-screen bg-paper pb-12">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1000px] items-center gap-3 px-4 sm:px-6">
          <Link href="/match" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-hover hover:text-ink" aria-label="比赛大厅">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent-soft text-accent"><Swords className="h-4 w-4" /></span>
            <div>
              <div className="font-serif text-[15px] leading-4">1v1 竞赛</div>
              <div className="text-[9px] text-faint">{state.status === "running" || finished ? `第 ${Math.min(state.me.currentIndex + 1, state.total)} / ${state.total} 题` : "实时 PK"}</div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2 text-[10px] text-muted">
            <span className="hidden sm:inline">{displayName}{isGuest ? " · 游客" : ""}</span>
            {finished && <Link href="/match" className="rounded-lg bg-ink px-3 py-1.5 text-[10px] text-paper">再来一局</Link>}
            <ThemeToggle compact />
            {isGuest && <button onClick={logout} className="text-faint hover:text-ink">退出</button>}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1000px] px-4 pt-5 sm:px-6 sm:pt-8">
        {state.status === "waiting" && <WaitingCard state={state} onCancel={cancel} />}
        {state.status === "generating" && <GeneratingCard state={state} onCancel={cancel} />}
        {state.status === "ready" && <ReadyCard state={state} countdown={countdown} />}
        {state.status === "cancelled" && (
          <div className="rounded-2xl border border-line bg-surface p-8 text-center">
            <p className="font-serif text-lg">{state.message || "比赛已取消"}</p>
            <Link href="/match" className="mt-4 inline-flex rounded-lg bg-ink px-4 py-2 text-xs text-paper">返回大厅</Link>
          </div>
        )}

        {(state.status === "running" || finished) && (
          <>
            <Scoreboard state={state} finished={finished} />
            {!finished && !waitingForOpponent && q && (
              <QuestionCard
                q={q} state={state} selected={selected} feedback={feedback} submitting={submitting}
                remain={remain} pctLeft={pctLeft} onPick={pick} error={error}
              />
            )}
            {!finished && waitingForOpponent && <WaitOpponent state={state} />}
            {finished && <Result state={state} won={won} />}
          </>
        )}

        {error && state && <div className="mt-3 rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-[11px] text-accent">{error}</div>}
      </div>
    </main>
  );
}

function WaitingCard({ state, onCancel }: { state: State; onCancel: () => void }) {
  return (
    <div className="mx-auto max-w-[520px] rounded-2xl border border-line bg-surface p-8 text-center">
      <div className="relative mx-auto grid h-20 w-20 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-brand-soft/70" />
        <span className="relative grid h-16 w-16 place-items-center rounded-full bg-brand-soft text-brand"><Users className="h-6 w-6" /></span>
      </div>
      <h2 className="mt-5 font-serif text-xl">正在匹配对手</h2>
      <p className="mt-1 text-[11px] text-muted">等待另一位在线考生加入…</p>
      <div className="mt-5 flex justify-center gap-1.5">
        {[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-brand" style={{ animationDelay: `${i * 0.2}s` }} />)}
      </div>
      <p className="mt-4 text-[10px] text-faint">最多等待 90 秒，建议保持页面打开</p>
      <button onClick={onCancel} className="mt-5 rounded-lg border border-line px-4 py-2 text-[11px] text-muted hover:border-line-strong hover:text-ink">取消匹配</button>
    </div>
  );
}

function GeneratingCard({ state, onCancel }: { state: State; onCancel: () => void }) {
  return (
    <div className="mx-auto max-w-[520px] rounded-2xl border border-line bg-surface p-8 text-center">
      <Loader2 className="mx-auto h-7 w-7 animate-spin text-accent" />
      <h2 className="mt-4 font-serif text-xl">已匹配到对手</h2>
      <p className="mt-1 text-[11px] text-muted">AI 正在为你们生成 10 道竞赛题，通常需要 20—50 秒</p>
      {state.opponent && (
        <div className="mt-5 rounded-xl bg-paper-2 px-4 py-3 text-[11px] text-muted">
          对手：<span className="font-medium text-ink">{state.opponent.displayName}</span>
          {state.opponent.isGuest && <span className="ml-1 rounded-full bg-accent-soft px-1.5 py-0.5 text-[9px] text-accent">游客</span>}
        </div>
      )}
      <div className="mt-5 flex justify-center gap-1.5">
        {[0, 1, 2].map(i => <span key={i} className="h-1.5 w-1.5 animate-soft-pulse rounded-full bg-accent" style={{ animationDelay: `${i * 0.25}s` }} />)}
      </div>
      <button onClick={onCancel} className="mt-6 rounded-lg border border-line px-4 py-2 text-[11px] text-muted hover:border-line-strong hover:text-ink">取消比赛</button>
    </div>
  );
}

function ReadyCard({ state, countdown }: { state: State; countdown: number }) {
  return (
    <div className="mx-auto max-w-[560px] rounded-2xl border border-line bg-surface p-8 text-center">
      <div className="text-[10px] uppercase tracking-[0.2em] text-faint">Match ready</div>
      <div className="mt-6 font-serif text-[72px] leading-none text-brand">{Math.max(1, countdown)}</div>
      <h2 className="mt-4 font-serif text-xl">准备开始</h2>
      <p className="mt-1 text-[11px] text-muted">{state.me.displayName} vs {state.opponent?.displayName || "对手"}</p>
      <p className="mt-4 text-[10px] text-faint">第一题开始后，计时立即启动</p>
    </div>
  );
}

function Scoreboard({ state, finished }: { state: State; finished: boolean }) {
  const opp = state.opponent;
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
      <div className="rounded-xl border border-brand/25 bg-brand-soft/50 px-4 py-3">
        <div className="flex items-center justify-between text-[10px] text-muted"><span>我</span><span className="font-medium text-brand">{state.me.score} 分</span></div>
        <div className="mt-1 truncate text-[13px] font-medium text-ink">{state.me.displayName}</div>
        <ProgressLine value={state.me.currentIndex} total={state.total} />
        <div className="mt-1 text-[9px] text-muted">{state.me.currentIndex}/{state.total} 题{state.me.finished ? " · 已完成" : ""}</div>
      </div>
      <div className="flex items-center justify-center text-[10px] text-faint"><Swords className="h-5 w-5" /> VS</div>
      <div className={cn("rounded-xl border px-4 py-3", opp && opp.score > state.me.score ? "border-accent/25 bg-accent-soft/40" : "border-line bg-surface")}>
        <div className="flex items-center justify-between text-[10px] text-muted"><span>对手</span><span className="font-medium text-ink">{opp?.score ?? 0} 分</span></div>
        <div className="mt-1 truncate text-[13px] font-medium text-ink">{opp?.displayName || "等待对手"}</div>
        <ProgressLine value={opp?.currentIndex || 0} total={state.total} />
        <div className="mt-1 text-[9px] text-muted">{opp ? `${opp.currentIndex}/${state.total} 题${opp.finished ? " · 已完成" : ""}` : "未连接"}</div>
      </div>
    </div>
  );
}

function ProgressLine({ value, total }: { value: number; total: number }) {
  return (
    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-track">
      <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${Math.min(100, (value / total) * 100)}%` }} />
    </div>
  );
}

function QuestionCard({ q, state, selected, feedback, submitting, remain, pctLeft, onPick, error }: {
  q: Q; state: State; selected: string; feedback: Feedback | null; submitting: boolean; remain: number; pctLeft: number;
  onPick: (key: string) => void; error: string;
}) {
  const urgent = remain <= 10;
  return (
    <div className="mt-4 rounded-2xl border border-line bg-surface p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-1 text-[10px]", SUBJECT_STYLE[q.subject] || "bg-surface-2 text-muted")}>{SUBJECT_SHORT[q.subject] || q.subject}</span>
        <span className="text-[10px] text-muted">第 {q.number} 题 · {q.chapter}</span>
        <span className="text-[10px] text-muted">· 答对 +{q.score}</span>
        <div className={cn("ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium", urgent ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted")}>
          <Clock3 className="h-3.5 w-3.5" /> {remain}s
        </div>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-track">
        <div className={cn("h-full rounded-full transition-all duration-300", urgent ? "bg-accent" : pctLeft < 45 ? "bg-amber" : "bg-brand")} style={{ width: `${pctLeft}%` }} />
      </div>

      <div className="mt-5">
        <Markdown className="text-[15px] leading-[1.9] sm:text-[16px]">{q.stem}</Markdown>
      </div>

      <div className="mt-5 space-y-2">
        {q.options.map(o => {
          const picked = selected === o.key;
          const isAnswer = feedback?.answer === o.key;
          return (
            <button
              key={o.key}
              onClick={() => onPick(o.key)}
              disabled={!!feedback || submitting}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all",
                !feedback && "border-line bg-paper-2 hover:border-line-strong hover:bg-surface-2",
                !feedback && picked && "border-brand bg-brand-soft/60",
                feedback && isAnswer && "border-brand/50 bg-brand-soft/70",
                feedback && picked && !isAnswer && "border-accent/40 bg-accent-soft/60",
                feedback && !isAnswer && !picked && "border-line bg-surface opacity-55"
              )}
            >
              <span className={cn(
                "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[11px] font-semibold",
                !feedback && picked ? "border-brand bg-brand text-paper" : "border-line-strong bg-surface text-muted",
                feedback && isAnswer && "border-brand bg-brand text-paper",
                feedback && picked && !isAnswer && "border-accent bg-accent text-paper"
              )}>
                {feedback && isAnswer ? <Check className="h-3 w-3" /> : feedback && picked && !isAnswer ? <X className="h-3 w-3" /> : o.key}
              </span>
              <Markdown className="min-w-0 flex-1 text-[13.5px] leading-6">{o.text}</Markdown>
            </button>
          );
        })}
      </div>

      {feedback && (
        <div className={cn("mt-4 rounded-xl border px-4 py-3", feedback.correct ? "border-brand/20 bg-brand-soft/40" : "border-accent/20 bg-accent-soft/40")}>
          <div className={cn("flex items-center gap-2 text-[11px] font-medium", feedback.correct ? "text-brand" : "text-accent")}>
            {feedback.timeout ? <TimerOff className="h-3.5 w-3.5" /> : feedback.correct ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            {feedback.timeout ? "时间到" : feedback.correct ? `答对 +${q.score} 分` : "答错了"}
            {!feedback.timeout && <span className="font-normal text-muted">正确答案：{feedback.answer}</span>}
          </div>
          {feedback.explanation && <div className="mt-2 border-t border-line pt-2"><Markdown className="text-[11.5px] leading-5">{feedback.explanation}</Markdown></div>}
        </div>
      )}

      {error && <div className="mt-3 rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-[10px] text-accent">{error}</div>}
    </div>
  );
}

function WaitOpponent({ state }: { state: State }) {
  return (
    <div className="mx-auto mt-4 max-w-[560px] rounded-2xl border border-line bg-surface p-8 text-center">
      <Crown className="mx-auto h-7 w-7 text-amber" />
      <h2 className="mt-3 font-serif text-xl">你已完成全部题目</h2>
      <p className="mt-1 text-[11px] text-muted">等待对手完成…</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-brand-soft/50 px-3 py-2"><div className="font-serif text-xl text-brand">{state.me.score}</div><div className="text-[9px] text-muted">我的得分</div></div>
        <div className="rounded-xl bg-surface-2 px-3 py-2"><div className="font-serif text-xl">{state.opponent?.score ?? 0}</div><div className="text-[9px] text-muted">对手得分</div></div>
      </div>
      <p className="mt-4 text-[10px] text-faint">对手进度：{state.opponent?.currentIndex ?? 0}/{state.total}</p>
    </div>
  );
}

function Result({ state, won }: { state: State; won: boolean }) {
  const draw = !state.winnerSessionId;
  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-6 text-center sm:p-8">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-soft text-brand"><Trophy className="h-6 w-6" /></div>
        <h2 className={cn("mt-3 font-serif text-[28px]", draw ? "text-ink" : won ? "text-brand" : "text-accent")}>
          {draw ? "平局" : won ? "你赢了" : "差一点"}
        </h2>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-brand-soft/50 px-3 py-3"><div className="font-serif text-2xl text-brand">{state.me.score}</div><div className="text-[9px] text-muted">{state.me.displayName}</div></div>
          <div className="rounded-xl bg-surface-2 px-3 py-3"><div className="font-serif text-2xl">{state.opponent?.score ?? 0}</div><div className="text-[9px] text-muted">{state.opponent?.displayName || "对手"}</div></div>
        </div>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link href="/match" className="rounded-lg bg-ink px-4 py-2 text-[11px] text-paper">再来一局</Link>
          <Link href="/" className="rounded-lg border border-line px-4 py-2 text-[11px] text-muted hover:text-ink">回首页</Link>
        </div>
      </div>

      {state.review && (
        <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <h3 className="font-serif text-base">逐题复盘</h3>
          <div className="mt-3 divide-y divide-line">
            {state.review.map(r => (
              <details key={r.idx} className="group py-3">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-[11px]">
                  <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[9px]", r.myCorrect ? "bg-brand-soft text-brand" : "bg-accent-soft text-accent")}>{r.idx + 1}</span>
                  <span className="truncate text-ink">{r.subject} · {r.chapter}</span>
                  <span className="ml-auto text-[10px] text-muted">我 {r.myAnswer || "—"} / 对手 {r.opponentAnswer || "—"} / 正确 {r.answer}</span>
                </summary>
                <div className="mt-2 pl-7">
                  <Markdown className="text-[12px] leading-6">{r.stem}</Markdown>
                  {r.explanation && <div className="mt-1"><Markdown className="text-[10px] leading-5 text-muted">{r.explanation}</Markdown></div>}
                </div>
              </details>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
