"use client";

import { useEffect, useRef, useState } from "react";
import { X, Send, Loader2, Sparkles } from "lucide-react";
import type { AttemptPublic, ChatMessage, QuestionPublic } from "@/lib/types";
import { Markdown } from "./Markdown";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "这一步为什么成立？",
  "还有别的解法吗？",
  "这个考点还会怎么考？",
  "帮我总结这道题的易错点",
];

export function ChatPanel({
  open, onClose, question, reveal, attempt, apiPath = "/api/chat",
}: {
  open: boolean;
  onClose: () => void;
  question: QuestionPublic;
  reveal?: { answer: string; explanation: string };
  attempt?: AttemptPublic | null;
  apiPath?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    setError("");
    setStreaming("");
    setMessages([]);
    fetch(`${apiPath}?questionId=${encodeURIComponent(question.id)}`)
      .then(r => r.json())
      .then(d => setMessages(Array.isArray(d.messages) ? d.messages : []))
      .catch(() => setError("加载对话失败"));
    setTimeout(() => inputRef.current?.focus(), 250);
  }, [open, question.id, apiPath]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming, open]);

  async function send(text?: string) {
    const content = (text ?? input).trim();
    if (!content || loading) return;
    setInput("");
    setError("");
    setMessages(prev => [...prev, { role: "user", content }]);
    setLoading(true);
    setStreaming("");
    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, message: content }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "回答失败");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          const line = part.split("\n").find(l => l.trim().startsWith("data:"));
          if (!line) continue;
          const payload = line.trim().slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let data: any = null;
          try { data = JSON.parse(payload); } catch { /* keepalive */ }
          if (data?.delta) { acc += data.delta; setStreaming(acc); }
          if (data?.error) { throw new Error(data.error); }
        }
      }
      setMessages(prev => [...prev, { role: "assistant", content: acc }]);
      setStreaming("");
    } catch (err) {
      setStreaming("");
      setError(err instanceof Error ? err.message : "回答失败");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#1f1d19]/30 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-[460px] flex-col border-l border-line bg-surface-2 shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted">
              <Sparkles className="h-3.5 w-3.5 text-accent" /> 追问模式
            </div>
            <div className="mt-1 line-clamp-1 font-serif text-[15px]">{question.topic || question.chapter}</div>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-ink">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {messages.length === 0 && !streaming && (
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-[12px] leading-6 text-muted">
                我已经看过这道题的标准答案和你的作答。你可以问思路、问另一解，也可以让我把这个考点再拆细一点。
              </p>
              {reveal && (
                <div className="mt-3 rounded-lg bg-sand px-3 py-2 text-[11px] text-muted">
                  标准答案：<span className="font-medium text-ink">{reveal.answer}</span>
                </div>
              )}
            </div>
          )}
          <div className="mt-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-6",
                  m.role === "user" ? "rounded-br-md bg-ink text-paper" : "rounded-bl-md border border-line bg-surface text-ink"
                )}>
                  {m.role === "assistant" ? <Markdown>{m.content}</Markdown> : <span className="whitespace-pre-wrap">{m.content}</span>}
                </div>
              </div>
            ))}
            {streaming && (
              <div className="flex justify-start">
                <div className="max-w-[88%] rounded-2xl rounded-bl-md border border-line bg-surface px-3.5 py-2.5 text-[13px] leading-6">
                  <Markdown>{streaming}</Markdown>
                  <span className="ml-1 inline-block h-3 w-1 animate-pulse bg-brand/60" />
                </div>
              </div>
            )}
            {loading && !streaming && (
              <div className="flex items-center gap-2 text-[11px] text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> 正在想…</div>
            )}
            {error && <div className="rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-[11px] text-accent">{error}</div>}
            <div ref={endRef} />
          </div>
        </div>

        {messages.length === 0 && (
          <div className="flex flex-wrap gap-1.5 px-5 pb-3">
            {SUGGESTIONS.map(s => (
              <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-surface px-2.5 py-1 text-[10px] text-muted transition-colors hover:border-line-strong hover:text-ink">
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="border-t border-line bg-sand px-4 py-3">
          <div className="flex items-end gap-2 rounded-xl border border-line bg-surface p-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
              rows={2}
              placeholder="继续追问… Enter 发送，Shift+Enter 换行"
              className="max-h-32 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[12px] leading-5 outline-none placeholder:text-faint"
            />
            <button
              onClick={() => send()}
              disabled={loading || !input.trim()}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink text-paper disabled:opacity-40"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="mt-1.5 text-center text-[9px] text-faint">AI 可能出错，关键结论请对照解析与教材</div>
        </div>
      </div>
    </div>
  );
}
