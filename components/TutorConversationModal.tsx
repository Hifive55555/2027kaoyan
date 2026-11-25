"use client";

import { useEffect, useState } from "react";
import { Archive, ArchiveRestore, Loader2, MessageCircle, Plus, Search, X } from "lucide-react";
import type { TutorConversationPublic } from "@/lib/types";
import { cn } from "@/lib/utils";
import { relativeTime, stripMarkdown } from "@/lib/utils";

export function TutorConversationModal({
  open, activeId, onClose, onSelect, onNew, onArchived,
}: {
  open: boolean;
  activeId: string;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => Promise<void>;
  onArchived: (id: string) => void;
}) {
  const [archived, setArchived] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<TutorConversationPublic[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tutor/conversations?archived=${archived ? 1 : 0}&q=${encodeURIComponent(query)}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "加载对话失败");
        if (!cancelled) setItems(Array.isArray(data.conversations) ? data.conversations : []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "加载对话失败");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 180);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, archived, query]);

  if (!open) return null;

  async function archive(item: TutorConversationPublic) {
    if (busyId) return;
    setBusyId(item.id);
    setError("");
    const next = !item.archivedAt;
    try {
      const res = await fetch(`/api/tutor/conversations/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: next }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "操作失败");
      setItems(prev => prev.filter(x => x.id !== item.id));
      if (next && item.id === activeId) onArchived(item.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setBusyId(null);
    }
  }

  async function create() {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      await onNew();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建对话失败");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#1f1d19]/45 p-4 backdrop-blur-[3px]" onClick={onClose}>
      <div className="flex max-h-[76vh] w-full max-w-[590px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-muted">
              <MessageCircle className="h-3.5 w-3.5 text-brand" /> Conversations
            </div>
            <h2 className="mt-1 font-serif text-[20px] text-ink">对话管理</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-hover hover:text-ink" aria-label="关闭"><X className="h-4 w-4" /></button>
        </div>

        <div className="border-b border-line px-4 py-3">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3">
            <Search className="h-3.5 w-3.5 text-faint" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索对话标题或内容…" className="h-9 min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-faint" />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex gap-1">
              <button onClick={() => setArchived(false)} className={cn("rounded-full px-2.5 py-1 text-[10px]", !archived ? "bg-ink text-paper" : "text-muted hover:bg-hover")}>历史</button>
              <button onClick={() => setArchived(true)} className={cn("rounded-full px-2.5 py-1 text-[10px]", archived ? "bg-ink text-paper" : "text-muted hover:bg-hover")}>已归档</button>
            </div>
            <button onClick={create} disabled={creating} className="inline-flex h-7 items-center gap-1 rounded-lg border border-line bg-surface px-2 text-[10px] text-muted hover:border-line-strong hover:text-ink disabled:opacity-40">
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} 新对话
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-[11px] text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> 加载中…</div>
          ) : items.length === 0 ? (
            <div className="py-14 text-center text-[11px] text-muted">{archived ? "没有已归档的对话。" : "还没有历史对话。"}</div>
          ) : (
            <div className="space-y-1">
              {items.map(item => (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect(item.id)}
                  onKeyDown={e => { if (e.key === "Enter") onSelect(item.id); }}
                  className={cn(
                    "group flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors",
                    item.id === activeId ? "border-brand/25 bg-brand-soft/30" : "border-transparent hover:border-line hover:bg-surface-2"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[12px] font-medium text-ink">{item.title}</span>
                      {item.id === activeId && <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[8px] text-brand">当前</span>}
                      {item.archivedAt && <span className="shrink-0 rounded-full bg-amber-soft px-1.5 py-0.5 text-[8px] text-amber">已归档</span>}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-[10px] text-muted">{stripMarkdown(item.lastMessage, 80) || "空白对话"}</p>
                    <div className="mt-1 flex items-center gap-2 text-[9px] text-faint">
                      <span>{item.messageCount} 条</span>
                      <span>·</span>
                      <span>{relativeTime(item.lastMessageAt || item.updatedAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); archive(item); }}
                    disabled={!!busyId}
                    className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-faint opacity-60 transition hover:bg-hover hover:text-ink group-hover:opacity-100 disabled:opacity-30"
                    title={item.archivedAt ? "取消归档" : "归档"}
                  >
                    {busyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : item.archivedAt ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  </button>
                </div>
              ))}
            </div>
          )}
          {error && <p className="px-3 py-2 text-[10px] text-accent">{error}</p>}
        </div>

        <div className="border-t border-line bg-sand px-4 py-2 text-center text-[9px] text-faint">归档的对话仍可查看，取消归档后可继续提问</div>
      </div>
    </div>
  );
}
