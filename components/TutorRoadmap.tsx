"use client";

import { CheckCircle2, Circle, CircleDot, Loader2, Route } from "lucide-react";
import type { TutorRoadmapItem } from "@/lib/types";
import { cn } from "@/lib/utils";

function buildTree(items: TutorRoadmapItem[]) {
  const byParent = new Map<string, TutorRoadmapItem[]>();
  for (const item of items) {
    const key = item.parentId || "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(item);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.sort - b.sort);
  return byParent;
}

function RoadmapNode({
  item, children, depth, busyId, onToggle,
}: {
  item: TutorRoadmapItem;
  children: ReturnType<typeof buildTree>;
  depth: number;
  busyId: string | null;
  onToggle: (item: TutorRoadmapItem) => void;
}) {
  const done = item.status === "done";
  const inProgress = item.status === "in_progress";
  return (
    <>
      <button
        onClick={() => onToggle(item)}
        disabled={!!busyId}
        className={cn(
          "group flex w-full items-start gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-hover",
          depth > 0 && "ml-4 w-[calc(100%-1rem)]"
        )}
      >
        <span className="mt-0.5 shrink-0">
          {busyId === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin text-brand" /> :
            done ? <CheckCircle2 className="h-3.5 w-3.5 text-brand" /> :
              inProgress ? <CircleDot className="h-3.5 w-3.5 text-amber" /> :
                <Circle className="h-3.5 w-3.5 text-faint group-hover:text-muted" />}
        </span>
        <span className={cn("min-w-0 text-[10px] leading-5", done ? "text-faint line-through" : inProgress ? "text-ink" : "text-muted")}>
          {item.title}
          {inProgress && <span className="ml-1 text-[8px] text-amber">进行中</span>}
        </span>
        {item.manual && (
          <span className="mt-0.5 shrink-0 rounded bg-subtle px-1 py-0.5 text-[8px] leading-none text-faint">你标记</span>
        )}
      </button>
      {(children.get(item.id) || []).map(child => (
        <RoadmapNode key={child.id} item={child} children={children} depth={depth + 1} busyId={busyId} onToggle={onToggle} />
      ))}
    </>
  );
}

export function TutorRoadmap({
  items, busyId, onToggle,
}: {
  items: TutorRoadmapItem[];
  busyId: string | null;
  onToggle: (item: TutorRoadmapItem) => void;
}) {
  const tree = buildTree(items);
  const done = items.filter(i => i.status === "done").length;
  const roots = tree.get("") || [];

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted">
          <Route className="h-3.5 w-3.5 text-brand" /> 学习路线
        </div>
        {items.length > 0 && <span className="text-[9px] text-faint">{done}/{items.length} 完成</span>}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-[10px] leading-5 text-muted">老师开始一个新主题时，会把接下来要讲的知识点按顺序放到这里，作为你们的待办。</p>
      ) : (
        <div className="mt-2 space-y-0.5">
          {roots.map(item => (
            <RoadmapNode key={item.id} item={item} children={tree} depth={0} busyId={busyId} onToggle={onToggle} />
          ))}
        </div>
      )}
      <p className="mt-2 text-[9px] leading-4 text-faint">点一下可标记完成；老师会看到你的标记，并先用一个小问题确认，再决定是否跳过。</p>
    </div>
  );
}
