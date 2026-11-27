"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, BookOpen, CheckCircle2, ChevronDown, GraduationCap, Loader2, MessageCircle,
  Plus, Route, Send, Sparkles, Target, X,
} from "lucide-react";
import type { LearnerProfile, TutorCheckPublic, TutorConversationPublic, TutorMessage, TutorQuizPublic, TutorRoadmapItem, TutorSource } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Markdown } from "./Markdown";
import { TutorQuizCard } from "./TutorQuizCard";
import { TutorCheckCard } from "./TutorCheckCard";
import { TutorRoadmap } from "./TutorRoadmap";
import { TutorConversationModal } from "./TutorConversationModal";
import { TutorSources } from "./TutorSources";
import { TutorCitation } from "./TutorCitation";
import { TutorSourceModal } from "./TutorSourceModal";
import { TutorSupervisionCard } from "./TutorSupervisionCard";

function pct(n: number) {
  return `${Math.round(n)}%`;
}

const TYPE_LABEL: Record<string, string> = { bank: "题库", knowledge: "知识点", syllabus: "大纲" };

type TurnStatus = { phase?: string; counts?: Partial<Record<string, number>> };

const STATUS_TEXT: Record<string, string> = {
  thinking: "老师正在想",
  searching: "老师正在查资料",
  quiz: "老师正在出题",
  checking: "老师正在准备检查题",
  writing: "老师正在组织语言",
  revising: "老师正在按督导意见重写",
};

function statusCounts(counts?: Partial<Record<string, number>>) {
  if (!counts) return "";
  return Object.entries(counts)
    .filter(([, count]) => count)
    .map(([type, count]) => `${TYPE_LABEL[type] || type} ${count}`)
    .join(" · ");
}

function visibleTutorText(text: string) {
  const marker = text.search(/\[\[(CHECK|QUIZ|ROADMAP)\]/i);
  if (marker >= 0) return text.slice(0, marker).trimEnd();
  // Hide a marker that is still streaming in, e.g. "[[S" or "[[S1" before "]]".
  const partial = text.match(/\[\[[A-Z0-9]{0,10}$/i);
  if (partial?.index !== undefined) return text.slice(0, partial.index).trimEnd();
  return text;
}

/** Number live sources by first citation so streamed numbers match the final ones. */
function orderSourcesByCitation(text: string, sources: TutorSource[]) {
  if (!sources.length) return sources;
  const known = new Set(sources.map(source => source.ref));
  const cited: string[] = [];
  for (const match of text.matchAll(/\[\[(S\d+)\]\]/g)) {
    const ref = match[1];
    if (known.has(ref) && !cited.includes(ref)) cited.push(ref);
  }
  if (!cited.length) return sources;
  const byRef = new Map(sources.map(source => [source.ref, source]));
  return [
    ...cited.map(ref => byRef.get(ref)!),
    ...sources.filter(source => !cited.includes(source.ref)),
  ];
}

/** Turn [[S1]] markers into clickable superscript links before Markdown runs. */
function withCitationLinks(text: string, sources: TutorSource[]) {
  if (!sources.length) return text.replace(/\[\[S\d+\]\]/g, "");
  const numbers = new Map<string, number>();
  sources.forEach((source, index) => numbers.set(source.ref, source.num ?? index + 1));
  return text.replace(/\[\[(S\d+)\]\]/g, (_marker, ref: string) => {
    const num = numbers.get(ref);
    return num ? `[${num}](#cite-${ref})` : "";
  });
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
  const [turnStatus, setTurnStatus] = useState<TurnStatus | null>(null);
  const [liveSources, setLiveSources] = useState<TutorSource[]>([]);
  const [slowTurn, setSlowTurn] = useState(false);
  const [activeSource, setActiveSource] = useState<TutorSource | null>(null);
  const [savingGoal, setSavingGoal] = useState(false);
  const [error, setError] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [conversationOpen, setConversationOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (messages.length === 0) {
      el.scrollTop = 0;
      return;
    }
    el.scrollTop = el.scrollHeight;
  }, [messages, loading, liveSources, turnStatus]);

  useEffect(() => {
    if (!loading) { setSlowTurn(false); return; }
    const timer = setTimeout(() => setSlowTurn(true), 4000);
    return () => clearTimeout(timer);
  }, [loading]);

  // Grow the composer with its content instead of clipping long questions.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const max = 200;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > el.clientHeight ? "auto" : "hidden";
  }, [input]);

  useEffect(() => {
    if (!profileOpen) return;
    const close = () => setProfileOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("scroll", close, { once: true });
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("scroll", close);
      window.removeEventListener("keydown", onKey);
    };
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
    setTurnStatus({ phase: "thinking" });
    setLiveSources([]);
    let done = false;
    // The reply can be rejected and rewritten in the same request, so track
    // whichever placeholder is currently streaming.
    let activeId = tempId;
    // Keep "查资料" on screen long enough to read: local lookups finish in a
    // few milliseconds, so without a floor the status would never paint.
    let searchingSince = 0;
    let statusTimer: ReturnType<typeof setTimeout> | null = null;
    const applyStatus = (next: TurnStatus) => {
      if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
      const now = Date.now();
      if (next.phase === "searching") searchingSince = now;
      const hold = next.phase === "writing" && searchingSince ? searchingSince + 800 - now : 0;
      if (hold > 0) {
        statusTimer = setTimeout(() => { statusTimer = null; setTurnStatus(next); }, hold);
        return;
      }
      setTurnStatus(next);
    };
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
          if (data.status) {
            applyStatus({ phase: String(data.status.phase || "thinking"), counts: data.status.counts });
          }
          if (Array.isArray(data.sources)) {
            setLiveSources(data.sources as TutorSource[]);
          }
          if (data.review) {
            // The supervisor rejected this draft: keep it, show the review,
            // and open a fresh placeholder for the rewritten answer.
            const rejected = { ...data.review.message, rejected: true } as TutorMessage;
            const supervision = data.review.supervision as TutorMessage;
            const nextId = `stream-rev-${Date.now()}`;
            acc = "";
            activeId = nextId;
            if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
            setLiveSources([]);
            setMessages(prev => [
              ...prev.filter(m => m.id !== tempId && m.id !== nextId),
              rejected,
              supervision,
              { id: nextId, role: "assistant", content: "", createdAt: new Date().toISOString() },
            ]);
            setStreamingId(nextId);
            continue;
          }
          if (data.delta) {
            acc += data.delta;
            const visible = visibleTutorText(acc);
            setMessages(prev => prev.map(m => m.id === activeId ? { ...m, content: visible } : m));
          }
          if (data.done) {
            done = true;
            if (statusTimer) { clearTimeout(statusTimer); statusTimer = null; }
            setTurnStatus(null);
            setLiveSources([]);
            setMessages(prev => [
              ...prev.filter(m => m.id !== activeId),
              data.message,
              ...(Array.isArray(data.extraMessages) ? data.extraMessages : []),
            ]);
            setStreamingId(null);
            if (data.roadmap) setRoadmap(data.roadmap);
            if (data.conversationTitle) setConversation(prev => ({ ...prev, title: data.conversationTitle }));
          }
        }
      }
      if (!done) throw new Error("连接中断了，老师的话没有传完");
      refreshProfile();
    } catch (err) {
      const remove = new Set([tempId, activeId, ...(opts.removeIds || [])]);
      setMessages(prev => prev.filter(m => !remove.has(m.id)));
      if (opts.restoreInput) setInput(opts.restoreInput);
      setError(err instanceof Error ? err.message : "老师暂时没回答上来");
    } finally {
      if (statusTimer) clearTimeout(statusTimer);
      setStreamingId(null);
      setLoading(false);
      setTurnStatus(null);
      setLiveSources([]);
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

  const statusKey = turnStatus?.phase || "thinking";
  const countsText = statusCounts(turnStatus?.counts);
  const showCounts = slowTurn && statusKey === "searching" && !!countsText;

  return (
    <div className="-mb-24 flex h-[calc(100dvh-3.5rem)] flex-col px-3 pb-[calc(3.75rem+env(safe-area-inset-bottom))] pt-2 lg:mx-auto lg:mb-0 lg:h-dvh lg:max-h-dvh lg:max-w-[1180px] lg:overflow-hidden lg:px-9 lg:py-6">
      {/* 手机端紧凑栏：只留对话切换与关键操作，把空间让给聊天区 */}
      <div className="flex shrink-0 items-center gap-1.5 pb-1 lg:hidden">
        <button
          onClick={() => setConversationOpen(true)}
          aria-label="切换对话"
          className="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[11px] text-muted"
        >
          <MessageCircle className="h-3.5 w-3.5 shrink-0 text-brand" />
          <span className="truncate font-medium text-ink">{conversation.title}</span>
          <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0" />
        </button>
        <button
          onClick={() => { newConversation().catch(err => setError(err instanceof Error ? err.message : "创建对话失败")); }}
          disabled={loading}
          aria-label="新对话"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={() => setProfileOpen(true)}
          aria-label="学习档案与路线"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted"
        >
          <Route className="h-4 w-4" />
        </button>
      </div>

      <div className="hidden shrink-0 flex-wrap items-end justify-between gap-3 lg:flex">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-muted">
            <GraduationCap className="h-3.5 w-3.5 text-brand" /> One-on-one tutor
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <h1 className="font-serif text-[28px] leading-none sm:text-[34px]">答疑</h1>
            <button onClick={() => setConversationOpen(true)} className="inline-flex max-w-[300px] items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-[10px] leading-none text-muted hover:border-line-strong hover:text-ink">
              <MessageCircle className="h-3 w-3 shrink-0" /> <span className="truncate">{conversation.title}</span> <ChevronDown className="h-3 w-3 shrink-0" />
            </button>
          </div>
          <p className="mt-1 max-w-xl text-[12px] leading-6 text-muted">
            带着疑问来。老师会先找到你卡住的那一步，再一小步一小步带你走；需要时会直接出一道题让你巩固。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { newConversation().catch(err => setError(err instanceof Error ? err.message : "创建对话失败")); }}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 text-[10px] text-muted hover:border-line-strong hover:text-ink disabled:opacity-40"
          >
            <Plus className="h-3 w-3" /> 新对话
          </button>
        </div>
      </div>

      <TutorConversationModal
        open={conversationOpen}
        activeId={conversation.id}
        onClose={() => setConversationOpen(false)}
        onSelect={id => { setConversationOpen(false); window.location.href = `/tutor?c=${id}`; }}
        onNew={newConversation}
        onArchived={id => { if (id === conversation.id) window.location.href = "/tutor"; }}
      />

      {/* 手机端：学习档案与路线放进底部抽屉，不再占用聊天高度 */}
      {profileOpen && (
        <div className="fixed inset-0 z-[60] flex items-end bg-[#1f1d19]/40 p-3 backdrop-blur-[2px] lg:hidden" onClick={() => setProfileOpen(false)}>
          <div className="max-h-[78vh] w-full space-y-3 overflow-y-auto overscroll-contain rounded-2xl border border-line bg-paper-2 p-3 shadow-2xl sm:mx-auto sm:max-w-[680px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-1">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted">Learning profile</div>
                <h2 className="mt-0.5 font-serif text-[18px] leading-tight">学习档案与路线</h2>
              </div>
              <button onClick={() => setProfileOpen(false)} aria-label="关闭" className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>
            <TutorRoadmap items={roadmap} busyId={roadmapBusy} onToggle={toggleRoadmap} />
            <ProfileCard profile={profile} goal={goal} setGoal={setGoal} saveGoal={saveGoal} savingGoal={savingGoal} />
          </div>
        </div>
      )}

      <div className="mt-2 grid min-h-0 flex-1 gap-5 lg:mt-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="-mx-3 flex h-full min-h-0 flex-col overflow-hidden border-0 bg-surface lg:mx-0 lg:rounded-2xl lg:border lg:border-line lg:shadow-[0_1px_2px_rgba(31,29,25,0.04)]">
          <div ref={scrollRef} data-chat-scroll className="flex-1 overflow-y-auto px-3.5 py-3.5 sm:px-6 sm:py-5">
            {messages.length === 0 && !loading ? (
              <div className="mx-auto flex min-h-full max-w-xl flex-col items-center justify-center py-5 text-center sm:py-10">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand sm:h-12 sm:w-12 sm:rounded-2xl"><Sparkles className="h-5 w-5" /></span>
                <h2 className="mt-3 font-serif text-[20px] text-ink sm:mt-4 sm:text-[22px]">先说说你卡在哪</h2>
                <p className="mt-1.5 max-w-md text-[11.5px] leading-5 text-muted sm:mt-2 sm:text-[12px] sm:leading-6">
                  不用把问题问得很完整。告诉我你在看哪一章、哪一步觉得别扭，我会先用一个问题确认你的理解，再往下走。
                </p>
                <div className="mt-4 grid w-full gap-1.5 sm:mt-5 sm:grid-cols-2 sm:gap-2">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-left text-[10.5px] leading-5 text-muted transition-colors hover:border-brand/40 hover:text-ink sm:py-2.5 sm:text-[11px]"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-2xl space-y-4">
                {messages.map(message => {
                  const ordered = message.id === streamingId
                    ? orderSourcesByCitation(message.content, liveSources)
                    : (message.sources || []);
                  const messageSources = ordered.map((source, index) => source.num ? source : { ...source, num: index + 1 });
                  const sourceByRef = new Map(messageSources.map(source => [source.ref, source]));
                  if (message.role === "system") {
                    return (
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
                    );
                  }
                  if (message.actor === "supervisor") {
                    const draft = messages.find(item => item.id === message.replyTo);
                    return (
                      <div key={message.id} className="flex justify-start">
                        <div className="w-full max-w-none">
                          <TutorSupervisionCard critique={message.content} draft={draft} />
                        </div>
                      </div>
                    );
                  }
                  // A rejected draft is shown inside the supervision card, not
                  // as a standalone teacher reply.
                  if (message.rejected) return null;
                  return (
                    <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                      <div className={cn(
                        "text-[13px] leading-6",
                        message.role === "user"
                          ? "max-w-[92%] break-words rounded-2xl rounded-br-md bg-ink px-3.5 py-2.5 text-paper"
                          : "w-full max-w-none py-1 text-ink"
                      )}>
                        {message.role === "assistant" ? (
                          <>
                            {(message.content || (!message.quiz && !message.check)) && (
                              <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-[0.12em] text-muted">
                                <Sparkles className="h-3 w-3 text-brand" /> 老师
                              </div>
                            )}
                            {message.content ? (
                              <Markdown
                                renderCitation={(ref, label) => {
                                  const source = sourceByRef.get(ref);
                                  if (!source) return <span>{label}</span>;
                                  return <TutorCitation source={source} label={label} onOpen={() => setActiveSource(source)} />;
                                }}
                              >
                                {withCitationLinks(visibleTutorText(message.content), messageSources)}
                              </Markdown>
                            ) : message.id === streamingId ? (
                              <div className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand-soft/40 px-3 py-1.5 text-[10px] text-brand">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>{STATUS_TEXT[statusKey] || STATUS_TEXT.thinking}…</span>
                                {showCounts && <span className="text-brand/60">（{countsText}）</span>}
                              </div>
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
                            {message.sources?.length ? (
                              <TutorSources
                                sources={message.sources}
                                uncited={message.uncitedSources}
                                onOpen={source => setActiveSource(source)}
                              />
                            ) : null}
                          </>
                        ) : (
                          <span className="whitespace-pre-wrap">{message.content}</span>
                        )}
                      </div>
                    </div>
                  );
                })}
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
          <div className="border-t border-line bg-sand px-2.5 py-2.5 sm:px-4 sm:py-3">
            <div className="flex items-end gap-2 rounded-xl border border-line bg-surface p-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                rows={1}
                disabled={!!conversation.archivedAt}
                placeholder={conversation.archivedAt ? "对话已归档，请先取消归档" : "写出你的疑问，越具体越好…"}
                className="max-h-[min(200px,32dvh)] min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2 text-[13.5px] leading-6 outline-none placeholder:text-faint"
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
            <div className="mt-1.5 hidden text-center text-[9px] text-faint sm:block">老师会参考你的做题档案；关键结论仍请以教材和真题解析为准</div>
          </div>
        </section>

        <aside className="no-scrollbar hidden min-h-0 space-y-3 lg:block lg:max-h-full lg:overflow-y-auto lg:overscroll-contain lg:pr-1">
          <TutorRoadmap items={roadmap} busyId={roadmapBusy} onToggle={toggleRoadmap} />
          <ProfileCard profile={profile} goal={goal} setGoal={setGoal} saveGoal={saveGoal} savingGoal={savingGoal} />
        </aside>
      </div>

      <TutorSourceModal source={activeSource} onClose={() => setActiveSource(null)} />
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
