"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, BookOpen, ChevronDown, GraduationCap, Lightbulb, Loader2, MessageCircle,
  RotateCcw, Send, Sparkles, Target, TrendingUp,
} from "lucide-react";
import type { LearnerProfile, TutorMessage, TutorQuizPublic } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Markdown } from "./Markdown";
import { TutorQuizCard } from "./TutorQuizCard";

function pct(n: number) {
  return `${Math.round(n)}%`;
}

function subjectName(id: string) {
  return ({ math2: "数学二", english2: "英语二", politics: "政治", cs408: "408" } as Record<string, string>)[id] || id;
}

export function TutorClient({
  initialMessages, initialProfile, initialGoal, suggestions,
}: {
  initialMessages: TutorMessage[];
  initialProfile: LearnerProfile;
  initialGoal: string;
  suggestions: string[];
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [profile, setProfile] = useState(initialProfile);
  const [goal, setGoal] = useState(initialGoal);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [quizBusy, setQuizBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [error, setError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (!profileOpen) return;
    const close = () => setProfileOpen(false);
    window.addEventListener("scroll", close, { once: true });
    return () => window.removeEventListener("scroll", close);
  }, [profileOpen]);

  async function refreshProfile() {
    try {
      const res = await fetch("/api/tutor/profile", { cache: "no-store" });
      const data = await res.json();
      if (res.ok && data.profile) {
        setProfile(data.profile);
        setGoal(data.profile.goal || "");
      }
    } catch { /* keep current profile */ }
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    setError("");
    const optimistic: TutorMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    setLoading(true);
    try {
      const res = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "老师暂时没回答上来");
      setMessages(prev => [...prev, data.message, ...(Array.isArray(data.extraMessages) ? data.extraMessages : [])]);
      refreshProfile();
    } catch (err) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setInput(content);
      setError(err instanceof Error ? err.message : "老师暂时没回答上来");
    } finally {
      setLoading(false);
    }
  }

  async function makeQuiz() {
    if (quizBusy || loading) return;
    setQuizBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tutor/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "出题失败");
      setMessages(prev => [...prev, data.message]);
      refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "出题失败");
    } finally {
      setQuizBusy(false);
    }
  }

  async function reset() {
    if (resetting || loading) return;
    if (messages.length && !window.confirm("清空当前对话？学习档案和做过的题不会删除。")) return;
    setResetting(true);
    setError("");
    try {
      const res = await fetch("/api/tutor/reset", { method: "POST" });
      if (!res.ok) throw new Error("清空失败");
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "清空失败");
    } finally {
      setResetting(false);
      inputRef.current?.focus();
    }
  }

  async function saveGoal() {
    if (savingGoal) return;
    setSavingGoal(true);
    setError("");
    try {
      const res = await fetch("/api/tutor/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal }),
      });
      if (!res.ok) throw new Error("保存目标失败");
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存目标失败");
    } finally {
      setSavingGoal(false);
    }
  }

  function updateQuiz(quiz: TutorQuizPublic) {
    setMessages(prev => prev.map(m => m.quiz?.id === quiz.id ? { ...m, quiz } : m));
    refreshProfile();
  }

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-5 lg:px-9 lg:py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted">
            <GraduationCap className="h-3.5 w-3.5 text-brand" /> One-on-one tutor
          </div>
          <h1 className="mt-2 font-serif text-[28px] leading-tight sm:text-[34px]">答疑</h1>
          <p className="mt-1 max-w-xl text-[12px] leading-6 text-muted">
            带着疑问来。老师会先找到你卡住的那一步，再一小步一小步带你走；需要时会直接出一道题让你巩固。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setProfileOpen(v => !v)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[10px] text-muted hover:border-line-strong hover:text-ink lg:hidden"
          >
            <TrendingUp className="h-3 w-3" /> 学习档案 <ChevronDown className={cn("h-3 w-3 transition-transform", profileOpen && "rotate-180")} />
          </button>
          <button
            onClick={makeQuiz}
            disabled={quizBusy || loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-soft px-2.5 text-[10px] text-brand hover:border-brand/60 disabled:opacity-40"
          >
            {quizBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lightbulb className="h-3 w-3" />}
            {quizBusy ? "出题中…" : "出题巩固"}
          </button>
          <button
            onClick={reset}
            disabled={resetting || loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[10px] text-muted hover:border-line-strong hover:text-ink disabled:opacity-40"
          >
            {resetting ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
            新对话
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="flex h-[calc(100dvh-340px)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(31,29,25,0.04)] lg:h-[calc(100vh-190px)] lg:min-h-[560px]">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
            {messages.length === 0 && !loading ? (
              <div className="mx-auto flex max-w-xl flex-col items-center justify-center py-10 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-soft text-brand"><Sparkles className="h-5 w-5" /></span>
                <h2 className="mt-4 font-serif text-[22px] text-ink">先说说你卡在哪</h2>
                <p className="mt-2 max-w-md text-[12px] leading-6 text-muted">
                  不用把问题问得很完整。告诉我你在看哪一章、哪一步觉得别扭，我会先用一个问题确认你的理解，再往下走。
                </p>
                <div className="mt-5 grid w-full gap-2 sm:grid-cols-2">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left text-[11px] leading-5 text-muted transition-colors hover:border-brand/40 hover:text-ink"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-2xl space-y-4">
                {messages.map(message => (
                  <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-6",
                      message.role === "user"
                        ? "rounded-br-md bg-ink text-paper"
                        : "rounded-bl-md border border-line bg-surface-2 text-ink"
                    )}>
                      {message.role === "assistant" ? (
                        <>
                          <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-muted">
                            <Sparkles className="h-3 w-3 text-brand" /> 老师
                          </div>
                          <Markdown>{message.content}</Markdown>
                          {message.quiz && (
                            <TutorQuizCard
                              quiz={message.quiz}
                              onUpdated={updateQuiz}
                              onAsk={send}
                            />
                          )}
                        </>
                      ) : (
                        <span className="whitespace-pre-wrap">{message.content}</span>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-2xl rounded-bl-md border border-line bg-surface-2 px-3.5 py-3 text-[11px] text-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" /> 老师正在想，先不急着一次讲完…
                    </div>
                  </div>
                )}
                {error && (
                  <div className="flex items-start gap-2 rounded-xl border border-accent/20 bg-accent-soft px-3 py-2 text-[11px] leading-5 text-accent">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-line bg-sand px-3 py-3 sm:px-4">
            <div className="flex items-end gap-2 rounded-xl border border-line bg-surface p-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                rows={2}
                placeholder="写出你的疑问，越具体越好… Enter 发送，Shift+Enter 换行"
                className="max-h-32 min-h-[42px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[12px] leading-5 outline-none placeholder:text-faint"
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink text-paper disabled:opacity-40"
                aria-label="发送"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="mt-1.5 text-center text-[9px] text-faint">老师会参考你的做题档案；关键结论仍请以教材和真题解析为准</div>
          </div>
        </section>

        <aside className={cn("space-y-3", !profileOpen && "hidden lg:block")}>
          <ProfileCard profile={profile} goal={goal} setGoal={setGoal} saveGoal={saveGoal} savingGoal={savingGoal} />
        </aside>
      </div>
    </div>
  );
}

function ProfileCard({
  profile, goal, setGoal, saveGoal, savingGoal,
}: {
  profile: LearnerProfile;
  goal: string;
  setGoal: (v: string) => void;
  saveGoal: () => void;
  savingGoal: boolean;
}) {
  const subjects = Object.entries(profile.subjects) as [string, { attempts: number; accuracy: number; weakChapters: { chapter: string; accuracy: number }[] }][];
  return (
    <>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted">
          <Target className="h-3.5 w-3.5 text-brand" /> 学习档案
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-sand py-2">
            <div className="font-serif text-lg">{profile.overview.totalAttempts}</div>
            <div className="text-[9px] text-muted">累计题数</div>
          </div>
          <div className="rounded-lg bg-sand py-2">
            <div className="font-serif text-lg">{profile.overview.accuracy}%</div>
            <div className="text-[9px] text-muted">正确率</div>
          </div>
          <div className="rounded-lg bg-sand py-2">
            <div className="font-serif text-lg">{profile.overview.streak}</div>
            <div className="text-[9px] text-muted">连续天</div>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {subjects.length === 0 && <p className="text-[10px] leading-5 text-muted">做几道题后，这里会出现各科正确率和薄弱章节。</p>}
          {subjects.map(([id, s]) => (
            <div key={id}>
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-ink">{subjectName(id)}</span>
                <span className="text-muted">{s.attempts} 题 · {pct(s.accuracy)}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-track">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, s.accuracy)}%` }} />
              </div>
              {s.weakChapters.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {s.weakChapters.slice(0, 2).map(c => <span key={c.chapter} className="rounded-full bg-amber-soft px-1.5 py-0.5 text-[9px] text-amber">{c.chapter}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted">
          <BookOpen className="h-3.5 w-3.5 text-accent" /> 最近错题
        </div>
        {profile.recentMistakes.length === 0 ? (
          <p className="mt-3 text-[10px] leading-5 text-muted">还没有错题记录。做错的题会自动进入这里。</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {profile.recentMistakes.slice(0, 4).map((m, i) => (
              <li key={i} className="text-[10px] leading-5">
                <div className="flex items-center gap-1.5 text-muted">
                  <span className="rounded bg-accent-soft px-1 py-0.5 text-[8px] text-accent">{subjectName(m.subject)}</span>
                  <span>{m.chapter || "未分类"}</span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-ink">{m.stem.replace(/[#*`_]/g, "").replace(/\s+/g, " ")}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted">
          <MessageCircle className="h-3.5 w-3.5 text-brand" /> 本周目标
        </div>
        <textarea
          value={goal}
          onChange={e => setGoal(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="例如：本周补完中值定理和 Cache 映射，每天 20 分钟。"
          className="mt-2 w-full resize-none rounded-lg border border-line bg-surface-2 px-2.5 py-2 text-[11px] leading-5 outline-none placeholder:text-faint focus:border-brand/50"
        />
        <button
          onClick={saveGoal}
          disabled={savingGoal}
          className="mt-2 inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface px-2 text-[10px] text-muted hover:border-line-strong hover:text-ink disabled:opacity-40"
        >
          {savingGoal ? <Loader2 className="h-3 w-3 animate-spin" /> : <Target className="h-3 w-3" />}
          保存目标
        </button>
        <p className="mt-2 text-[9px] leading-4 text-faint">档案由做题、随机刷题、比赛和答疑出题自动汇总；目标会一起提供给老师。</p>
      </div>
    </>
  );
}
