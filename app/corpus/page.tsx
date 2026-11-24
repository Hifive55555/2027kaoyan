import Link from "next/link";
import { ArrowUpRight, BookOpen, FileText } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SubjectIcon } from "@/components/SubjectIcon";
import { Card } from "@/components/ui";
import { allCorpusMeta } from "@/lib/corpus";
import { SUBJECTS , subjectTint } from "@/lib/subjects";

export const dynamic = "force-dynamic";

export default function CorpusPage() {
  const metas = allCorpusMeta();
  return (
    <AppShell>
      <div className="mx-auto max-w-[1080px] px-5 py-8 lg:px-10 lg:py-12">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Past papers · Markdown</div>
        <h1 className="mt-2 font-serif text-[30px] leading-tight sm:text-[36px]">真题库</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
          已整理为 Markdown，保留分题型、分小问和答案位置，方便阅读，也方便 AI 检索与模仿命题。
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {metas.map(m => {
            const config = SUBJECTS.find(s => s.id === m.subject)!;
            const latest = m.years[m.years.length - 1];
            return (
              <Card key={m.subject} className="overflow-hidden">
                <div className="flex items-start gap-3 p-5">
                  <span className="grid h-10 w-10 place-items-center rounded-xl" style={subjectTint(config.accent)}>
                    <SubjectIcon id={m.subject} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <h2 className="font-serif text-[18px]">{m.name}</h2>
                      <span className="font-mono text-[9px] text-muted">{m.code}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {m.years[0]}—{latest} · {m.years.length} 套{m.count ? ` · ${m.count} 题` : ""}
                    </p>
                  </div>
                  {latest && (
                    <Link href={`/corpus/${m.subject}/${latest}`} className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-[10px] hover:border-line-strong">
                      最新 <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap gap-1 border-t border-line bg-surface-3 p-3">
                  {m.years.slice().reverse().map(y => (
                    <Link key={y} href={`/corpus/${m.subject}/${y}`} className="rounded-md border border-line bg-surface px-2 py-1 font-mono text-[10px] text-muted transition-colors hover:border-brand/40 hover:text-ink">
                      {y}
                    </Link>
                  ))}
                </div>
                <div className="flex items-center justify-between px-5 py-2.5 text-[10px] text-muted">
                  <span>{m.note}</span>
                  <Link href={`/corpus/${m.subject}`} className="inline-flex items-center gap-1 hover:text-ink">
                    <BookOpen className="h-3 w-3" /> 阅读索引
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="mt-8 rounded-2xl border border-line bg-surface-3 p-5 text-[11px] leading-6 text-muted">
          <div className="flex items-center gap-2 font-medium text-ink"><FileText className="h-4 w-4 text-brand" /> 关于材料来源</div>
          <p className="mt-2">
            真题文本来自公开 GitHub 仓库（gtqbhksl/22408、Echo1LZJY/echo-kaoyan-english-skill、Nishino0525Nanase/kaoyan-politics、neville-studio/408-exam-paper）及公开真题页面。
            数学/政治/408 的题库含公开答案与解析；英语二的参考译文和写作范文为第三方 AI 生成，不是官方答案。所有材料仅用于个人学习，不用于商业用途。
          </p>
        </div>
      </div>
    </AppShell>
  );
}
