import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Markdown } from "@/components/Markdown";
import { Card } from "@/components/ui";
import { getKnowledgeEntry } from "@/lib/knowledge";

export const dynamic = "force-dynamic";

export default async function KnowledgeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = getKnowledgeEntry(decodeURIComponent(id));
  if (!entry) notFound();
  return (
    <AppShell>
      <div className="mx-auto max-w-[860px] px-5 py-8 lg:px-10 lg:py-12">
        <Link href={`/knowledge?subject=${entry.subject}`} className="inline-flex items-center gap-1.5 text-[11px] text-muted hover:text-ink">
          <ArrowLeft className="h-3.5 w-3.5" /> 返回知识点
        </Link>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-[10px] text-faint">
          <span className="rounded-full bg-brand-soft px-2.5 py-1 text-brand">{entry.chapter || "综合"}</span>
          <span>{entry.source}</span>
          {entry.sourceUrl && (
            <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-ink">
              原文 <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <h1 className="mt-3 font-serif text-[26px] leading-tight sm:text-[32px]">{entry.title}</h1>
        <Card className="mt-5 p-5 sm:p-7">
          <Markdown className="text-[13px] leading-7">{entry.text}</Markdown>
        </Card>
        <p className="mt-4 text-[10px] leading-5 text-faint">资料为公开学习站整理，版权归原作者；发现错误请以教材和真题解析为准。</p>
      </div>
    </AppShell>
  );
}
