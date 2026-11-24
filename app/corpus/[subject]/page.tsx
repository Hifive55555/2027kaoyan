import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Card } from "@/components/ui";
import { corpusMeta, subjectName } from "@/lib/corpus";
import type { SubjectId } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID: SubjectId[] = ["math2", "english2", "politics", "cs408"];

export default async function CorpusSubjectPage({ params }: { params: Promise<{ subject: string }> }) {
  const { subject } = await params;
  if (!VALID.includes(subject as SubjectId)) notFound();
  const id = subject as SubjectId;
  const meta = corpusMeta(id);
  return (
    <AppShell>
      <div className="mx-auto max-w-[980px] px-5 py-8 lg:px-10 lg:py-12">
        <Link href="/corpus" className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> 真题库</Link>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted">{meta.code} · Markdown</div>
            <h1 className="mt-2 font-serif text-[30px] leading-tight">{subjectName(id)}真题</h1>
            <p className="mt-1 text-sm text-muted">{meta.years[0]}—{meta.years[meta.years.length - 1]} · {meta.years.length} 套 · {meta.note}</p>
          </div>
          <Link href={`/corpus/${id}/${meta.years[meta.years.length - 1]}`} className="inline-flex items-center gap-1 rounded-lg bg-ink px-3 py-2 text-[11px] text-paper">读最新一套 <ArrowUpRight className="h-3 w-3" /></Link>
        </div>

        <div className="mt-7 grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-7">
          {meta.years.slice().reverse().map(y => (
            <Link key={y} href={`/corpus/${id}/${y}`}>
              <Card className="group p-3 text-center transition-all hover:-translate-y-0.5 hover:border-line-strong">
                <div className="font-serif text-lg">{y}</div>
                <div className="mt-0.5 text-[9px] text-muted">年度真题</div>
              </Card>
            </Link>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-line bg-surface p-5 text-[11px] leading-6 text-muted">
          每份文件包含：题目正文、选项、答案与解析。英语二的参考译文与写作范文为 AI 生成，非官方答案。数学公式使用 LaTeX，可在支持 KaTeX 的阅读器中直接渲染。
        </div>
      </div>
    </AppShell>
  );
}
