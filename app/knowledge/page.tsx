import Link from "next/link";
import { ArrowUpRight, BookOpen, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui";
import { SUBJECTS } from "@/lib/subjects";
import { knowledgeCounts, listKnowledge } from "@/lib/knowledge";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function excerpt(text: string, max = 190) {
  const s = String(text || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/[#*`_>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ subject?: string; q?: string }> }) {
  const sp = await searchParams;
  const subject = SUBJECTS.some(s => s.id === sp.subject) ? sp.subject : "cs408";
  const q = String(sp.q || "").trim();
  const counts = knowledgeCounts();
  const items = listKnowledge(subject, q, 120);
  const total = counts[subject || ""] || 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1100px] px-5 py-8 lg:px-10 lg:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted">knowledge base</div>
            <h1 className="mt-2 font-serif text-[30px] leading-tight sm:text-[36px]">知识点</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
              从公开学习站整理的分科知识点，供检索和答疑引用；原文版权归原作者，个人学习使用。
            </p>
          </div>
          <form action="/knowledge" className="flex h-10 w-full max-w-[320px] items-center gap-2 rounded-xl border border-line bg-surface px-3">
            <input type="hidden" name="subject" value={subject} />
            <Search className="h-3.5 w-3.5 shrink-0 text-faint" />
            <input name="q" defaultValue={q} placeholder="搜知识点、术语、题干…" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-faint" />
          </form>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {SUBJECTS.map(s => (
            <Link key={s.id} href={`/knowledge?subject=${s.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={cn("rounded-full border px-3 py-1.5 text-[11px] transition-colors", subject === s.id ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink")}>
              {s.name} <span className="ml-1 text-[9px] opacity-60">{counts[s.id] || 0}</span>
            </Link>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-[10px] text-faint">
          <span>{q ? `“${q}” 的匹配结果` : "按来源整理"} · {items.length}{items.length >= 120 ? "+" : ""} 条</span>
          <span>共 {total} 条</span>
        </div>

        {items.length === 0 ? (
          <Card className="mt-4 p-8 text-center text-sm text-muted">没有找到匹配的知识点，换个关键词试试。</Card>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {items.map(item => (
              <Link key={item.id} href={`/knowledge/${encodeURIComponent(item.id)}`} className="group block">
                <Card className="h-full p-4 transition-colors group-hover:border-line-strong group-hover:bg-surface-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><BookOpen className="h-3.5 w-3.5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <h2 className="min-w-0 flex-1 text-[13px] font-medium leading-5 text-ink">{item.title}</h2>
                        <ArrowUpRight className="mt-1 h-3 w-3 shrink-0 text-faint opacity-0 transition group-hover:opacity-100" />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] text-faint">
                        <span className="rounded-full bg-subtle px-2 py-0.5 text-muted">{item.chapter || "综合"}</span>
                        {item.kind === "vocab" && <span className="rounded-full bg-amber-soft px-2 py-0.5 text-amber">词汇</span>}
                        {item.kind === "sentence" && <span className="rounded-full bg-blue-soft px-2 py-0.5 text-blue">长难句</span>}
                        <span>{item.source}</span>
                      </div>
                      <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-muted">{excerpt(item.text)}</p>
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}

        <p className="mt-6 text-[10px] leading-5 text-faint">
          <Link href="/bank" className="text-muted underline decoration-line-strong underline-offset-4 hover:text-ink">查看扩展题库 →</Link>
        </p>
        <p className="mt-2 text-[10px] leading-5 text-faint">
          资料来自 kaoyan-408-os / kaoyan-408-coa / kaoyan-408-networks / data-structure-site / 张宇数学 / 英语长难句 / 考研词汇等项目；题目图片单独存放在本地资源目录，避免文字抽取时丢图。
        </p>
      </div>
    </AppShell>
  );
}
