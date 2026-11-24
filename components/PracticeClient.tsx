"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, ImagePlus, Lightbulb,
  Loader2, MessageCircle, QrCode, RefreshCw, SkipForward, Sparkles, Trash2, X, AlertCircle,
} from "lucide-react";
import type { AttemptPublic, GradeFeedback, PaperPublic, QuestionPublic } from "@/lib/types";
import { isChoiceType, isMultiType, typeLabel, TYPE_COLOR } from "@/lib/subjects";
import { cn } from "@/lib/utils";
import { Badge, Button, Card, Progress, Spinner } from "./ui";
import { Markdown } from "./Markdown";
import { ChatPanel } from "./ChatPanel";
import { SessionTimer } from "./SessionTimer";
import { PhoneUploadModal } from "./PhoneUploadModal";
import { compressImage } from "@/lib/image";

const VERDICT_LABEL: Record<string, string> = {
  correct: "答对",
  partial: "部分得分",
  wrong: "答错",
  skipped: "已跳过",
};

function wordCount(text: string, english: boolean) {
  if (english) return text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0;
  return text.replace(/\s/g, "").length;
}


export function PracticeClient({ initialPaper, initialQuestionId }: { initialPaper: PaperPublic; initialQuestionId?: string }) {
  const [paper, setPaper] = useState(initialPaper);
  const firstOpen = initialPaper.questions.find(q => !q.attempt)?.id || initialPaper.questions[0]?.id;
  const [currentId, setCurrentId] = useState(
    initialQuestionId && initialPaper.questions.some(q => q.id === initialQuestionId) ? initialQuestionId : firstOpen
  );
  const [answers, setAnswers] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialPaper.questions
        .filter(q => q.attempt?.answer)
        .map(q => [q.id, q.attempt!.answer])
    )
  );
  const [images, setImages] = useState<Record<string, string>>({});
  const [revealMap, setRevealMap] = useState<Record<string, { answer: string; explanation: string }>>({});
  const [busy, setBusy] = useState(false);
  const [skipBusy, setSkipBusy] = useState(false);
  const [similarBusy, setSimilarBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [materialExpanded, setMaterialExpanded] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneStatus, setPhoneStatus] = useState<"creating" | "pending" | "uploaded" | "expired" | "error">("pending");
  const [phoneTicket, setPhoneTicket] = useState<{ token: string; url: string; expiresAt: string; questionId: string } | null>(null);
  const [phoneError, setPhoneError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const idx = paper.questions.findIndex(q => q.id === currentId);
  const current = paper.questions[idx] || paper.questions[0];
  const section = paper.sections.find(s => s.id === current?.sectionId);
  const attempt = current?.attempt || null;
  const reveal = current?.reveal || (current ? revealMap[current.id] : undefined);
  const answered = paper.questions.filter(q => q.attempt && !q.attempt.skipped);
  const completed = paper.questions.filter(q => q.attempt);
  const score = answered.reduce((s, q) => s + (q.attempt?.score || 0), 0);
  const maxScore = answered.reduce((s, q) => s + (q.attempt?.maxScore || 0), 0);
  const draft = current ? (answers[current.id] || "") : "";
  const currentImage = current ? (images[current.id] || attempt?.imagePath || "") : "";
  const english = paper.subject === "english2";

  useEffect(() => {
    setMaterialExpanded(false);
    setError("");
    setChatOpen(false);
    setPhoneOpen(false);
    setPhoneTicket(null);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentId]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  function patchQuestion(id: string, patch: Partial<QuestionPublic>) {
    setPaper(p => ({ ...p, questions: p.questions.map(q => q.id === id ? { ...q, ...patch } : q) }));
  }

  function retryCurrent() {
    if (!current) return;
    patchQuestion(current.id, { attempt: null, revealed: false, reveal: undefined });
    setRevealMap(prev => { const next = { ...prev }; delete next[current.id]; return next; });
    setAnswers(prev => { const next = { ...prev }; delete next[current.id]; return next; });
    setImages(prev => { const next = { ...prev }; delete next[current.id]; return next; });
    setChatOpen(false);
    setError("");
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function go(delta: number) {
    const next = Math.max(0, Math.min(paper.questions.length - 1, idx + delta));
    setCurrentId(paper.questions[next].id);
  }

  function choose(letter: string) {
    if (!current || attempt) return;
    if (isMultiType(current.type)) {
      const set = new Set((answers[current.id] || "").split(""));
      if (set.has(letter)) set.delete(letter); else set.add(letter);
      const val = [...set].sort().join("");
      setAnswers({ ...answers, [current.id]: val });
    } else {
      setAnswers({ ...answers, [current.id]: letter });
    }
  }

  async function submit() {
    if (!current || busy) return;
    const text = draft.trim();
    if (!text && !currentImage) {
      setError("先写下你的答案，或上传一张手写解答图片。");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: current.id, answer: text, imagePath: currentImage || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "批改失败");
      patchQuestion(current.id, { attempt: data.attempt, revealed: true });
      setRevealMap(prev => ({ ...prev, [current.id]: data.reveal }));
      setImages(prev => { const next = { ...prev }; delete next[current.id]; return next; });
      setToast("批改完成");
      setTimeout(() => document.getElementById("result-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch (err) {
      setError(err instanceof Error ? err.message : "批改失败");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (!current || skipBusy) return;
    setSkipBusy(true);
    setError("");
    try {
      const res = await fetch("/api/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: current.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作失败");
      patchQuestion(current.id, { attempt: data.attempt, revealed: true });
      setRevealMap(prev => ({ ...prev, [current.id]: data.reveal }));
      setToast("已跳过，答案已展开");
      setTimeout(() => document.getElementById("result-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setSkipBusy(false);
    }
  }

  async function similar() {
    if (!current || similarBusy) return;
    setSimilarBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/questions/${current.id}/similar`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成失败");
      setPaper(data.paper);
      const newId = data.newQuestionIds?.[0];
      if (newId) setCurrentId(newId);
      setToast("已加入一道同类题");
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setSimilarBusy(false);
    }
  }

  async function onFile(file: File | undefined) {
    if (!file || !current) return;
    setUploading(true);
    setError("");
    try {
      const blob = await compressImage(file);
      const fd = new FormData();
      fd.append("file", blob, "answer.jpg");
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "上传失败");
      setImages(prev => ({ ...prev, [current.id]: data.path }));
      setToast("图片已上传");
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeImage() {
    if (!current) return;
    setImages(prev => { const next = { ...prev }; delete next[current.id]; return next; });
    if (current.attempt) patchQuestion(current.id, { attempt: { ...current.attempt, imagePath: null } });
  }

  async function openPhoneUpload() {
    if (!current || (phoneOpen && phoneStatus === "creating")) return;
    const questionId = current.id;
    setPhoneOpen(true);
    setPhoneStatus("creating");
    setPhoneError("");
    setPhoneTicket(null);
    try {
      const res = await fetch("/api/upload-tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "生成二维码失败");
      const base = (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, "");
      setPhoneTicket({ ...data, url: `${base}/m/upload/${data.token}` });
      setPhoneStatus("pending");
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "生成二维码失败");
      setPhoneStatus("error");
    }
  }

  useEffect(() => {
    if (!phoneOpen || !phoneTicket || phoneStatus !== "pending") return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/upload-tickets/${phoneTicket.token}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || cancelled) return;
        if (data.status === "uploaded" && data.imagePath) {
          setImages(prev => ({ ...prev, [data.questionId]: data.imagePath }));
          setPhoneStatus("uploaded");
          setToast("手机图片已收到");
        } else if (data.status === "expired") {
          setPhoneStatus("expired");
        }
      } catch { /* transient poll failure */ }
    };
    const id = setInterval(poll, 2000);
    poll();
    return () => { cancelled = true; clearInterval(id); };
  }, [phoneOpen, phoneTicket, phoneStatus]);

  useEffect(() => {
    if (!phoneOpen || phoneStatus !== "uploaded") return;
    const t = setTimeout(() => setPhoneOpen(false), 900);
    return () => clearTimeout(t);
  }, [phoneOpen, phoneStatus]);

  const material = section?.material || "";
  const longMaterial = material.length > 600;

  if (!current) {
    return <div className="p-10 text-center text-muted">这份练习没有题目。</div>;
  }

  return (
    <div ref={topRef} className="mx-auto max-w-[1240px] px-4 py-5 lg:px-10 lg:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href={`/practice?subject=${paper.subject}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-surface text-muted hover:text-ink">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="truncate font-serif text-[16px] text-ink">{paper.title}</div>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted">
              <span>{paper.chapter}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> <SessionTimer /></span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] text-muted sm:flex">
            <span>已作答 {answered.length}/{paper.questions.length}</span>
            {maxScore > 0 && <span className="text-ink">· {score}/{maxScore} 分</span>}
          </div>
          <Link href={`/practice/${paper.id}/summary`}>
            <Button variant="outline" size="sm">交卷</Button>
          </Link>
        </div>
      </div>

      <div className="mt-4">
        <Progress value={completed.length} max={paper.questions.length} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
        <div className="min-w-0">
          <Card className="overflow-hidden">
            {material && (
              <div className="border-b border-line bg-surface-3">
                <div className="flex items-center justify-between px-5 pt-4">
                  <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-muted">
                    <span className="h-1 w-1 rounded-full bg-accent" /> 材料 / Passage
                  </div>
                  {longMaterial && (
                    <button onClick={() => setMaterialExpanded(v => !v)} className="inline-flex items-center gap-1 text-[10px] text-muted hover:text-ink">
                      {materialExpanded ? "收起" : "展开全文"} <ChevronDown className={cn("h-3 w-3 transition-transform", materialExpanded && "rotate-180")} />
                    </button>
                  )}
                </div>
                <div className={cn("px-5 pb-4 pt-2", !materialExpanded && longMaterial && "max-h-[340px] overflow-y-auto")}>
                  <Markdown className="text-[13.5px] leading-7 text-ink/80">{material}</Markdown>
                </div>
              </div>
            )}

            <div className="p-5 sm:p-7">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={TYPE_COLOR[current.type] || "bg-subtle text-muted"}>{typeLabel(current.type)}</Badge>
                <span className="text-[10px] text-muted">{current.score} 分</span>
                <span className="text-[10px] text-muted">·</span>
                <span className="text-[10px] text-muted">{current.difficulty}</span>
                {current.chapter && <><span className="text-[10px] text-muted">·</span><span className="text-[10px] text-muted">{current.chapter}</span></>}
                <span className="ml-auto text-[10px] text-faint">第 {idx + 1} / {paper.questions.length} 题</span>
              </div>

              <div className="mt-4">
                <Markdown className="text-[15.5px] leading-[1.9]">{current.stem}</Markdown>
              </div>

              {current.options.length > 0 && (
                <div className="mt-5 space-y-2">
                  {current.options.map(o => {
                    const selected = isMultiType(current.type) ? draft.includes(o.key) : draft === o.key;
                    const isCorrect = !!reveal && reveal.answer.includes(o.key);
                    const isWrongPick = !!attempt && selected && !isCorrect;
                    return (
                      <button
                        key={o.key}
                        onClick={() => choose(o.key)}
                        disabled={!!attempt}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-all",
                          !attempt && "hover:border-line-strong hover:bg-surface-2",
                          selected && !attempt && "border-brand bg-brand-soft/60",
                          !selected && !attempt && "border-line bg-surface",
                          isCorrect && attempt && "border-brand/50 bg-brand-soft/60",
                          isWrongPick && "border-accent/40 bg-accent-soft/60",
                          attempt && !isCorrect && !isWrongPick && "border-line bg-surface opacity-70"
                        )}
                      >
                        <span className={cn(
                          "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border text-[11px] font-semibold",
                          selected && !attempt ? "border-brand bg-brand text-paper" : "border-line-strong bg-surface-2 text-muted",
                          isCorrect && attempt && "border-brand bg-brand text-paper",
                          isWrongPick && "border-accent bg-accent text-paper"
                        )}>
                          {isCorrect && attempt ? <Check className="h-3 w-3" /> : isWrongPick ? <X className="h-3 w-3" /> : o.key}
                        </span>
                        <Markdown className="min-w-0 flex-1 text-[14px] leading-6">{o.text}</Markdown>
                      </button>
                    );
                  })}
                </div>
              )}

              {isChoiceType(current.type) ? null : (
                <div className="mt-5">
                  <textarea
                    value={draft}
                    onChange={e => setAnswers({ ...answers, [current.id]: e.target.value })}
                    disabled={!!attempt}
                    rows={current.type === "fill" ? 3 : current.type === "translation" || current.type === "writing" ? 8 : 10}
                    placeholder={
                      current.type === "fill" ? "写出最终答案…"
                        : current.type === "solution" ? "写出完整解题过程，关键步骤不要跳步…"
                          : current.type === "analysis" ? "分点作答，先写原理，再结合材料…"
                            : current.type === "translation" ? "写下你的中文译文…"
                              : current.type === "writing" ? "写下你的作文…"
                                : "写出你的答案…"
                    }
                    className="w-full resize-y rounded-xl border border-line bg-surface px-4 py-3 text-[14px] leading-7 outline-none transition-colors placeholder:text-faint focus:border-brand/50 disabled:bg-sand"
                  />
                  <div className="mt-1.5 flex items-center justify-between text-[10px] text-faint">
                    <span>{english ? "英文作答请控制字数" : "题干中的公式可用 LaTeX，例如 $x^2$"}</span>
                    <span>{english ? `约 ${wordCount(draft, true)} 词` : `${wordCount(draft, false)} 字`}</span>
                  </div>
                </div>
              )}

              {!attempt && !isChoiceType(current.type) && (
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
                  <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading || busy}>
                    {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                    {uploading ? "上传中" : "手写图片"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={openPhoneUpload} disabled={uploading || busy} className="hidden sm:inline-flex">
                    <QrCode className="h-3.5 w-3.5" /> 手机扫码
                  </Button>
                  {currentImage && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-2 py-1 text-[10px] text-brand">
                      已上传 <button onClick={removeImage}><Trash2 className="h-3 w-3" /></button>
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-faint">支持拍照 / 截图 / 手机扫码，≤ 8MB</span>
                </div>
              )}

              {currentImage && (
                <a href={currentImage} target="_blank" rel="noreferrer" className="mt-3 block w-fit">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={currentImage} alt="手写解答" className="max-h-56 rounded-xl border border-line bg-surface object-contain" />
                </a>
              )}

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-[11px] leading-5 text-accent">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {error}
                </div>
              )}

              {!attempt && (
                <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-line pt-5">
                  <Button onClick={submit} disabled={busy || (!draft.trim() && !currentImage)}>
                    {busy ? <Spinner className="text-paper" /> : <Sparkles className="h-4 w-4" />}
                    {busy ? "批改中…" : "提交批改"}
                  </Button>
                  <Button variant="ghost" onClick={skip} disabled={skipBusy}>
                    {skipBusy ? <Spinner /> : <SkipForward className="h-3.5 w-3.5" />} 跳过
                  </Button>
                  <span className="ml-auto hidden text-[10px] text-faint sm:block">AI 批改会给出得分、失分点与参考步骤</span>
                </div>
              )}
            </div>
          </Card>

          {attempt && (
            <ResultPanel
              attempt={attempt}
              reveal={reveal}
              question={current}
              onNext={() => {
                if (idx >= paper.questions.length - 1) window.location.href = `/practice/${paper.id}/summary`;
                else go(1);
              }}
              onSimilar={similar}
              similarBusy={similarBusy}
              onChat={() => setChatOpen(true)}
              onRetry={retryCurrent}
              isLast={idx >= paper.questions.length - 1}
            />
          )}

          <div className="mt-4 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={() => go(-1)} disabled={idx === 0}>
              <ChevronLeft className="h-4 w-4" /> 上一题
            </Button>
            {attempt ? (
              <button onClick={() => setChatOpen(true)} className="inline-flex items-center gap-1.5 text-[11px] text-muted hover:text-ink">
                <MessageCircle className="h-3.5 w-3.5" /> 对这题有疑问？
              </button>
            ) : <span className="text-[10px] text-faint">作答后可追问</span>}
            <Button variant="ghost" size="sm" onClick={() => go(1)} disabled={idx >= paper.questions.length - 1}>
              下一题 <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <aside className="space-y-4">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">题目导航</h3>
              <span className="text-[10px] text-muted">{completed.length}/{paper.questions.length}</span>
            </div>
            <div className="mt-3 grid grid-cols-6 gap-1.5 lg:grid-cols-5">
              {paper.questions.map((q, i) => {
                const done = !!q.attempt;
                const skipped = q.attempt?.skipped;
                const correct = q.attempt?.verdict === "correct";
                return (
                  <button
                    key={q.id}
                    onClick={() => setCurrentId(q.id)}
                    className={cn(
                      "grid h-8 place-items-center rounded-md border text-[11px] transition-all",
                      q.id === current.id ? "border-ink bg-ink text-paper" : skipped ? "border-line-strong bg-amber-soft text-amber" : done ? correct ? "border-brand/30 bg-brand-soft text-brand" : "border-accent/30 bg-accent-soft text-accent" : "border-line bg-surface text-muted hover:border-line-strong"
                    )}
                    title={`第 ${i + 1} 题${skipped ? " · 已跳过" : done ? correct ? " · 正确" : " · 待复盘" : ""}`}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-faint">
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-brand-soft ring-1 ring-brand/30" /> 正确</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-accent-soft ring-1 ring-accent/30" /> 待复盘</span>
              <span className="inline-flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-amber-soft ring-1 ring-line-strong" /> 跳过</span>
            </div>
          </Card>

          <Card className="p-4">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted">本次表现</h3>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-lg bg-sand py-2.5">
                <div className="font-serif text-lg">{answered.length}</div>
                <div className="text-[9px] text-muted">已作答</div>
              </div>
              <div className="rounded-lg bg-sand py-2.5">
                <div className="font-serif text-lg">{maxScore ? Math.round((score / maxScore) * 100) : 0}%</div>
                <div className="text-[9px] text-muted">得分率</div>
              </div>
            </div>
            <div className="mt-3 space-y-2 text-[11px]">
              <div className="flex items-center justify-between text-muted"><span>当前得分</span><span className="font-medium text-ink">{score} / {maxScore || "—"}</span></div>
              <div className="flex items-center justify-between text-muted"><span>跳过</span><span className="font-medium text-ink">{paper.questions.filter(q => q.attempt?.skipped).length}</span></div>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center gap-2 text-[11px] text-muted"><Lightbulb className="h-3.5 w-3.5 text-accent" /> 小提示</div>
            <p className="mt-2 text-[10px] leading-5 text-muted">
              先独立写完整过程，再提交。批改后不要只看分数，重点看「失分点」和「参考步骤」。
            </p>
          </Card>
        </aside>
      </div>

      <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} question={current} reveal={reveal} attempt={attempt} />
      <PhoneUploadModal
        open={phoneOpen}
        url={phoneTicket?.url || ""}
        status={phoneStatus}
        error={phoneError}
        expiresAt={phoneTicket?.expiresAt}
        onClose={() => setPhoneOpen(false)}
      />

      {toast && (
        <div className="fixed bottom-20 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-[11px] text-paper shadow-lg lg:bottom-8">
          {toast}
        </div>
      )}
    </div>
  );
}

function ResultPanel({
  attempt, reveal, question, onNext, onSimilar, similarBusy, onChat, onRetry, isLast,
}: {
  attempt: AttemptPublic;
  reveal?: { answer: string; explanation: string };
  question: QuestionPublic;
  onNext: () => void;
  onSimilar: () => void;
  similarBusy: boolean;
  onChat: () => void;
  onRetry: () => void;
  isLast: boolean;
}) {
  const fb: GradeFeedback = attempt.feedback || {};
  const verdict = attempt.skipped ? "skipped" : attempt.verdict || "wrong";
  const color = verdict === "correct" ? "text-brand" : verdict === "partial" ? "text-amber" : verdict === "skipped" ? "text-amber" : "text-accent";
  const bg = verdict === "correct" ? "bg-brand-soft" : verdict === "partial" ? "bg-amber-soft" : verdict === "skipped" ? "bg-amber-soft" : "bg-accent-soft";
  const correctAnswer = reveal?.answer || fb.referenceAnswer || "";

  return (
    <Card id="result-panel" className="mt-4 scroll-mt-24 overflow-hidden animate-rise">
      <div className={cn("flex flex-wrap items-center gap-3 border-b border-line px-5 py-4", bg)}>
        <div className="flex items-baseline gap-1">
          <span className={cn("font-serif text-3xl", color)}>{attempt.score ?? 0}</span>
          <span className="text-[11px] text-muted">/ {attempt.maxScore ?? question.score}</span>
        </div>
        <div className={cn("rounded-full px-2.5 py-1 text-[10px] font-medium", color, "bg-surface/60")}>{VERDICT_LABEL[verdict] || verdict}</div>
        <div className="min-w-0 flex-1 text-[11px] leading-5 text-muted">{fb.summary || "已记录本次作答。"}</div>
      </div>

      <div className="space-y-4 p-5">
        {!attempt.skipped && fb.dimensions && fb.dimensions.length > 0 && (
          <div className="space-y-2.5">
            {fb.dimensions.map((d, i) => (
              <div key={i}>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-ink">{d.name}</span>
                  <span className="text-muted">{d.score} / {d.max}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-track">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${d.max ? Math.min(100, (d.score / d.max) * 100) : 0}%` }} />
                </div>
                {d.comment && <p className="mt-1 text-[10px] leading-5 text-muted">{d.comment}</p>}
              </div>
            ))}
          </div>
        )}

        {(fb.strengths?.length || fb.issues?.length) ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {!!fb.strengths?.length && (
              <div className="rounded-lg border border-brand/15 bg-brand-soft/40 p-3">
                <div className="text-[10px] font-medium text-brand">做对了</div>
                <ul className="mt-1.5 space-y-1 text-[11px] leading-5 text-brand">
                  {fb.strengths.map((s, i) => <li key={i}>· {s}</li>)}
                </ul>
              </div>
            )}
            {!!fb.issues?.length && (
              <div className="rounded-lg border border-accent/15 bg-accent-soft/40 p-3">
                <div className="text-[10px] font-medium text-accent">失分点</div>
                <ul className="mt-1.5 space-y-1 text-[11px] leading-5 text-accent">
                  {fb.issues.map((s, i) => <li key={i}>· {s}</li>)}
                </ul>
              </div>
            )}
          </div>
        ) : null}

        {correctAnswer && (
          <div className="rounded-lg border border-line bg-surface-3 px-3.5 py-3">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">标准答案</div>
            <div className="mt-1"><Markdown className="text-[13px] leading-6">{String(correctAnswer)}</Markdown></div>
          </div>
        )}

        {reveal?.explanation && (
          <details className="group rounded-lg border border-line bg-surface">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-[11px] font-medium text-ink">
              查看完整解析
              <ChevronDown className="h-3.5 w-3.5 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <div className="border-t border-line px-3.5 py-3">
              <Markdown className="text-[12.5px] leading-6">{reveal.explanation}</Markdown>
            </div>
          </details>
        )}

        {fb.steps?.length ? (
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">参考步骤</div>
            <ol className="mt-2 space-y-1.5 text-[12px] leading-6 text-muted">
              {fb.steps.map((s, i) => <li key={i} className="flex gap-2"><span className="shrink-0 text-brand">{i + 1}.</span><Markdown className="min-w-0 flex-1 text-[12px] leading-6">{s}</Markdown></li>)}
            </ol>
          </div>
        ) : null}

        {fb.knowledgePoints?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {fb.knowledgePoints.map((k, i) => (
              <span key={i} className="rounded-full bg-subtle px-2 py-1 text-[10px] text-muted">{k}</span>
            ))}
          </div>
        ) : null}

        {fb.nextAction && <p className="text-[11px] leading-5 text-muted">下一步：{fb.nextAction}</p>}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button onClick={onNext}>{isLast ? "查看本次总结" : "下一题"} <ArrowRight className="h-4 w-4" /></Button>
          <Button variant="outline" onClick={onSimilar} disabled={similarBusy}>
            {similarBusy ? <Spinner /> : <RefreshCw className="h-3.5 w-3.5" />}
            {similarBusy ? "出题中…" : "做同类题"}
          </Button>
          <Button variant="soft" onClick={onChat}><MessageCircle className="h-3.5 w-3.5" /> 追问</Button>
          <Button variant="ghost" onClick={onRetry}><RefreshCw className="h-3.5 w-3.5" /> 重做</Button>
        </div>
      </div>
    </Card>
  );
}
