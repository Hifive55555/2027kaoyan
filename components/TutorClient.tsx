"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, BookOpen, CheckCircle2, ChevronDown, GraduationCap, Lightbulb, Loader2, MessageCircle,
  RotateCcw, Send, Sparkles, Target, TrendingUp,
} from "lucide-react";
import type { LearnerProfile, TutorCheckPublic, TutorConversationPublic, TutorMessage, TutorQuizPublic, TutorRoadmapItem } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Markdown } from "./Markdown";
import { TutorQuizCard } from "./TutorQuizCard";
import { TutorCheckCard } from "./TutorCheckCard";
import { TutorRoadmap } from "./TutorRoadmap";
import { TutorConversationModal } from "./TutorConversationModal";

function pct(n: number) {
  return `${Math.round(n)}%`;
}

function visibleTutorText(text: string) {
  const marker = text.search(/\[\[(CHECK|QUIZ|ROADMAP)\]/i);
  if (marker >= 0) return text.slice(0, marker).trimEnd();
  const partial = text.lastIndexOf("[[");
  if (partial >= 0 && text.length - partial < 16) return text.slice(0, partial).trimEnd();
  return text;
}

function subjectName(id: string) {
  return ({ math2: "数学二", english2: "英语二", politics: "政治", cs408: "408" } as Record<string, string>)[id] || id;
}

export function TutorClient({
  initialConversation, initialMessages, initialProfile, initialGoal, initialRoadmap, suggestions,
}: {
  initialConversation: TutorConversationPublic;
  initialMessages: TutorMessage[];
  initialProfile: LearnerProfile;
  initialGoal: string;
  initialRoadmap: TutorRoadmapItem[];
  suggestions: string[];
}) {
  const [conversation, setConversation] = useState(initialConversation);
  const [messages, setMessages] = useState(initialMessages);
  const [profile, setProfile] = useState(initialProfile);
  const [goal, setGoal] = useState(initialGoal);
  const [roadmap, setRoadmap] = useState(initialRoadmap);
  const [roadmapBusy, setRoadmapBusy] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [error, setError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(false);
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

  async function toggleRoadmap(item: TutorRoadmapItem) {
    if (roadmapBusy) return;
    const next = item.status === "done" ? "pending" : "done";
    setRoadmapBusy(item.id);
    setRoadmap(prev => prev.map(x => x.id === item.id ? { ...x, status: next } : x));
    try {
      const res = await fetch(`/api/tutor/roadmap/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const data = await res.json();
      if (res.ok && data.roadmap) setRoadmap(data.roadmap);
    } catch { /* keep optimistic state */ }
    finally { setRoadmapBusy(null); }
  }

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

  async function runTutorStream(body: Record<string, unknown>, opts: { removeIds?: string[]; restoreInput?: string } = {}) {
    const tempId = `stream-${Date.now()}`;
    const placeholder: TutorMessage = {
      id: tempId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, placeholder]);
    setStreamingId(tempId);
    setLoading(true);
    setError("");
    let done = false;
    try {
      const res = await fetch("/api/tutor/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "老师暂时没回答上来");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { done: ended, value } = await reader.read();
        if (ended) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.split("\n").find(l => l.trim().startsWith("data:"));
          if (!line) continue;
          const payload = line.trim().slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let data: any;
          try { data = JSON.parse(payload); } catch { continue; }
          if (data.error) throw new Error(data.error);
          if (data.delta) {
            acc += data.delta;
            const visible = visibleTutorText(acc);
            setMessages(prev => prev.map(m => m.id === tempId ? { ...m, content: visible } : m));
          }
          if (data.done) {
            done = true;
            setMessages(prev => [
              ...prev.filter(m => m.id !== tempId),
              data.message,
              ...(Array.isArray(data.extraMessages) ? data.extraMessages : []),
            ]);
            if (data.roadmap) setRoadmap(data.roadmap);
            if (data.conversationTitle) setConversation(prev => ({ ...prev, title: data.conversationTitle }));
          }
        }
      }
      if (!done) throw new Error("连接中断了，老师的话没有传完");
      refreshProfile();
    } catch (err) {
      const remove = new Set([tempId, ...(opts.removeIds || [])]);
      setMessages(prev => prev.filter(m => !remove.has(m.id)));
      if (opts.restoreInput) setInput(opts.restoreInput);
      setError(err instanceof Error ? err.message : "老师暂时没回答上来");
    } finally {
      setStreamingId(null);
      setLoading(false);
    }
  }

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    const optimistic: TutorMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimistic]);
    await runTutorStream({ message: content, conversationId: conversation.id }, { removeIds: [optimistic.id], restoreInput: content });
  }

  async function newConversation() {
    const res = await fetch("/api/tutor/conversations", { method: "POST" });
    const data = await res.json();
    if (!res.ok || !data.conversation) throw new Error(data.error || "创建对话失败");
    window.location.href = `/tutor?c=${data.conversation.id}`;
  }

  async function makeQuiz() {
    if (quizBusy || loading) return;
    setQuizBusy(true);
    setError("");
    try {
      const res = await fetch("/api/tutor/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.id }),
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

  function updateCheck(check: TutorCheckPublic) {
    setMessages(prev => prev.map(m => m.check?.id === check.id ? { ...m, check } : m));
  }

  async function followUpOnCheck(check: TutorCheckPublic) {
    await runTutorStream({ eventCheckId: check.id, conversationId: conversation.id });
  }

  async function followUpOnQuiz(quiz: TutorQuizPublic) {
    await runTutorStream({ eventQuizId: quiz.id, conversationId: conversation.id });
  }

  return (
    <div className="mx-auto flex max-w-[1180px] flex-col px-4 py-5 lg:h-dvh lg:max-h-dvh lg:overflow-hidden lg:px-9 lg:py-6">
      <div className="shrink-0 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted">
            <GraduationCap className="h-3.5 w-3.5 text-brand" /> One-on-one tutor
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-[28px] leading-tight sm:text-[34px]">答疑</h1>
            <button onClick={() => setConversationOpen(true)} className="inline-flex max-w-[300px] items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-[10px] text-muted hover:border-line-strong hover:text-ink">
              <MessageCircle className="h-3 w-3 shrink-0" /> <span className="truncate">{conversation.title}</span> <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
          </div>
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
            disabled={quizBusy || loading || !!conversation.archivedAt}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-brand/30 bg-brand-soft px-2.5 text-[10px] text-brand hover:border-brand/60 disabled:opacity-40"
          >
            {quizBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lightbulb className="h-3 w-3" />}
            {quizBusy ? "出题中…" : "出题巩固"}
          </button>
          <button
            onClick={() => { newConversation().catch(err => setError(err instanceof Error ? err.message : "创建对话失败")); }}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[10px] text-muted hover:border-line-strong hover:text-ink disabled:opacity-40"
          >
            <RotateCcw className="h-3 w-3" /> 新对话
          </button>
        </div>
      </div>

      <div className="mt-4 shrink-0 lg:hidden">
        <TutorRoadmap items={roadmap} busyId={roadmapBusy} onToggle={toggleRoadmap} />
      </div>

      <TutorConversationModal
        open={conversationOpen}
        activeId={conversation.id}
        onClose={() => setConversationOpen(false)}
        onSelect={id => { setConversationOpen(false); window.location.href = `/tutor?c=${id}`; }}
        onNew={newConversation}
        onArchived={id => { if (id === conversation.id) window.location.href = "/tutor"; }}
      />

      <div className="mt-5 grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="flex h-[calc(100dvh-340px)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgba(31,29,25,0.04)] lg:h-full lg:min-h-0">
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
                {messages.map(message => message.role === "system" ? (
                  <div key={message.id} className="flex justify-center py-0.5">
                    <span className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[9px]",
                      /答错|与预期不同/.test(message.content) ? "border-accent/20 bg-accent-soft text-accent" : "border-line bg-surface-2 text-muted"
                    )}>
                      {/答错|与预期不同/.test(message.content)
                        ? <AlertCircle className="h-3 w-3" />
                        : <CheckCircle2 className="h-3 w-3 text-brand" />}
                      {message.content}
                    </span>
                  </div>
                ) : (
                  <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "text-[13px] leading-6",
                      message.role === "user"
                        ? "max-w-[92%] rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-paper"
                        : "w-full max-w-none py-1 text-ink"
                    )}>
                      {message.role === "assistant" ? (
                        <>
                          <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-muted">
                            <Sparkles className="h-3 w-3 text-brand" /> 老师
                          </div>
                          {message.content ? <Markdown>{visibleTutorText(message.content)}</Markdown> : message.id === streamingId ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted"><Loader2 className="h-3 w-3 animate-spin" /> 老师正在组织语言…</span>
                          ) : null}
                          {message.quiz && (
                            <TutorQuizCard
                              quiz={message.quiz}
                              readOnly={!!conversation.archivedAt}
                              onUpdated={updateQuiz}
                              onAnswered={(quiz, systemMessage) => { updateQuiz(quiz); if (systemMessage) setMessages(prev => [...prev, systemMessage]); followUpOnQuiz(quiz); }}
                            />
                          )}
                          {message.check && (
                            <TutorCheckCard
                              check={message.check}
                              readOnly={!!conversation.archivedAt}
                              onUpdated={updateCheck}
                              onAnswered={(check, systemMessage) => { updateCheck(check); if (systemMessage) setMessages(prev => [...prev, systemMessage]); followUpOnCheck(check); }}
                            />
                          )}
                        </>
                      ) : (
                        <span className="whitespace-pre-wrap">{message.content}</span>
                      )}
                    </div>
                  </div>
                ))}
                {loading && !streamingId && (
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

          {conversation.archivedAt && (
            <div className="flex flex-wrap items-center gap-2 border-t border-amber/20 bg-amber-soft px-4 py-2 text-[10px] text-amber">
              此对话已归档，取消归档后才能继续提问。
              <button onClick={() => setConversationOpen(true)} className="rounded-full border border-amber/30 px-2 py-0.5 hover:border-amber/60">管理对话</button>
            </div>
          )}
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
                disabled={!!conversation.archivedAt}
                placeholder={conversation.archivedAt ? "对话已归档，请先取消归档" : "写出你的疑问，越具体越好… Enter 发送，Shift+Enter 换行"}
                className="max-h-32 min-h-[42px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[12px] leading-5 outline-none placeholder:text-faint"
              />
              <button
                onClick={() => send()}
                disabled={loading || !input.trim() || !!conversation.archivedAt}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink text-paper disabled:opacity-40"
                aria-label="发送"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
            <div className="mt-1.5 text-center text-[9px] text-faint">老师会参考你的做题档案；关键结论仍请以教材和真题解析为准</div>
          </div>
        </section>

        <aside className={cn("no-scrollbar min-h-0 space-y-3 lg:max-h-full lg:overflow-y-auto lg:overscroll-contain lg:pr-1", !profileOpen && "hidden lg:block")}>
          <TutorRoadmap items={roadmap} busyId={roadmapBusy} onToggle={toggleRoadmap} />
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
