import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, FileText, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Markdown } from "@/components/Markdown";
import { Card } from "@/components/ui";
import { corpusMeta, readCorpus, subjectName } from "@/lib/corpus";
import type { SubjectId } from "@/lib/types";

export const dynamic = "force-dynamic";

const VALID: SubjectId[] = ["math2", "english2", "politics", "cs408"];

export default async function CorpusYearPage({ params }: { params: Promise<{ subject: string; year: string }> }) {
  const { subject, year } = await params;
  if (!VALID.includes(subject as SubjectId)) notFound();
  const y = Number(year);
  const id = subject as SubjectId;
  const data = readCorpus(id, y);
  if (!data) notFound();
  const meta = corpusMeta(id);
  const years = meta.years;
  const i = years.indexOf(y);
  const prev = i > 0 ? years[i - 1] : null;
  const next = i >= 0 && i < years.length - 1 ? years[i + 1] : null;

  return (
    <AppShell>
      <div className="mx-auto max-w-[900px] px-5 py-8 lg:px-10 lg:py-10">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/corpus/${id}`} className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> {subjectName(id)}真题</Link>
          <div className="flex items-center gap-1.5 text-[10px]">
            {prev && <Link href={`/corpus/${id}/${prev}`} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-muted hover:text-ink"><ArrowLeft className="h-3 w-3" /> {prev}</Link>}
            {next && <Link href={`/corpus/${id}/${next}`} className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-muted hover:text-ink">{next} <ArrowRight className="h-3 w-3" /></Link>}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="font-serif text-[28px] leading-tight">{y} 年 · {subjectName(id)}</h1>
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-[10px] text-brand">Markdown</span>
          {data.meta.quality && <span className="rounded-full bg-subtle px-2.5 py-1 text-[10px] text-muted">{data.meta.quality}</span>}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted">
          <span className="inline-flex items-center gap-1"><FileText className="h-3 w-3" /> {data.content.length.toLocaleString()} 字符</span>
          <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> 答案在文末</span>
          {data.meta.source && <span>来源：{data.meta.source}</span>}
        </div>

        <Card className="mt-6 p-5 sm:p-8">
          <Markdown className="text-[14px] leading-7">{data.content}</Markdown>
        </Card>

        <div className="mt-5 flex items-center justify-between">
          {prev ? <Link href={`/corpus/${id}/${prev}`} className="text-[11px] text-muted hover:text-ink">← {prev} 年</Link> : <span />}
          {next ? <Link href={`/corpus/${id}/${next}`} className="text-[11px] text-muted hover:text-ink">{next} 年 →</Link> : <span />}
        </div>
        <p className="mt-8 text-[10px] leading-5 text-faint">
          材料仅用于个人学习。若发现错漏，请以原卷和官方答案为准。
        </p>
      </div>
    </AppShell>
  );
}
