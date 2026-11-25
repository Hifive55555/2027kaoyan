import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Markdown } from "@/components/Markdown";
import { Card } from "@/components/ui";
import { loadExternalBank, searchExternalBank } from "@/lib/external-bank";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function brief(text: string, max = 1400) {
  const s = String(text || "");
  return s.length > max ? `${s.slice(0, max)}\n\n…（完整内容见原文）` : s;
}

export default async function ExternalBankPage({ searchParams }: { searchParams: Promise<{ subject?: string; q?: string }> }) {
  const sp = await searchParams;
  const subject: "math2" | "cs408" = sp.subject === "math2" ? "math2" : "cs408";
  const q = String(sp.q || "").trim();
  const total = loadExternalBank(subject).length;
  const items = searchExternalBank(subject, q, 40);
  return (
    <AppShell>
      <div className="mx-auto max-w-[1000px] px-5 py-8 lg:px-10 lg:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted">extended bank</div>
            <h1 className="mt-2 font-serif text-[30px] leading-tight sm:text-[36px]">扩展题库</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
              来自公开学习站的补充题，含原题图片；随机刷题会从这里抽选择题，主观题可在这里对照原题和解析复习。
            </p>
          </div>
          <form action="/bank" className="flex h-10 w-full max-w-[320px] items-center gap-2 rounded-xl border border-line bg-surface px-3">
            <input type="hidden" name="subject" value={subject} />
            <Search className="h-3.5 w-3.5 shrink-0 text-faint" />
            <input name="q" defaultValue={q} placeholder="搜题干、章节、来源…" className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-faint" />
          </form>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          {[{ id: "cs408", name: "408 扩展" }, { id: "math2", name: "数学二扩展" }].map(s => (
            <Link key={s.id} href={`/bank?subject=${s.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={cn("rounded-full border px-3 py-1.5 text-[11px]", subject === s.id ? "border-brand bg-brand-soft text-brand" : "border-line bg-surface text-muted hover:text-ink")}>
              {s.name} <span className="ml-1 text-[9px] opacity-60">{loadExternalBank(s.id as "math2" | "cs408").length}</span>
            </Link>
          ))}
          <Link href="/random" className="ml-auto text-[10px] text-muted underline decoration-line-strong underline-offset-4 hover:text-ink">去随机刷题 →</Link>
        </div>

        <div className="mt-4 flex items-center justify-between text-[10px] text-faint">
          <span>{q ? `“${q}” 的匹配结果` : "按题库顺序"} · {items.length} 条</span>
          <span>共 {total} 题</span>
        </div>

        <div className="mt-4 space-y-3">
          {items.map(item => (
            <Card key={item.id} className="p-5">
              <div className="flex flex-wrap items-center gap-2 text-[10px] text-faint">
                <span className="rounded-full bg-brand-soft px-2.5 py-1 text-brand">{item.chapter}</span>
                {item.topic && <span>{item.topic}</span>}
                <span className="ml-auto">{item.source}{item.sourceUrl && <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="ml-1 inline-flex align-middle"><ExternalLink className="h-3 w-3" /></a>}</span>
              </div>
              <div className="mt-3"><Markdown className="text-[13px] leading-7">{item.stem}</Markdown></div>
              {item.options.length > 0 && (
                <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                  {item.options.map(o => (
                    <div key={o.key} className="flex gap-2 rounded-lg border border-line bg-paper-2 px-3 py-2 text-[11.5px] leading-5">
                      <span className="font-semibold text-muted">{o.key}.</span>
                      <Markdown className="min-w-0 flex-1">{o.text}</Markdown>
                    </div>
                  ))}
                </div>
              )}
              <details className="mt-3 border-t border-line pt-3 text-[11px] leading-6 text-muted">
                <summary className="cursor-pointer text-[10px] text-faint hover:text-ink">查看答案与解析</summary>
                <div className="mt-2"><b className="text-ink">答案：</b><Markdown className="mt-1">{brief(item.answer)}</Markdown></div>
                {item.explanation && <div className="mt-2"><b className="text-ink">解析：</b><Markdown className="mt-1">{brief(item.explanation)}</Markdown></div>}
              </details>
            </Card>
          ))}
        </div>
        {!items.length && <Card className="mt-4 p-8 text-center text-sm text-muted">没有找到匹配题目。</Card>}
        <p className="mt-6 text-[10px] leading-5 text-faint">扩展题库用于个人学习；题图保留在本地，版权归原书/原作者。</p>
      </div>
    </AppShell>
  );
}
