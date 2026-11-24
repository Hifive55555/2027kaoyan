import Link from "next/link";
import { ArrowUpRight, BookmarkX } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SubjectIcon } from "@/components/SubjectIcon";
import { Badge, Card, EmptyState } from "@/components/ui";
import { getMistakes } from "@/lib/queries";
import { requireUserPage } from "@/lib/auth";
import { SUBJECTS, typeLabel, TYPE_COLOR , subjectTint } from "@/lib/subjects";
import { relativeTime, stripMarkdown } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MistakesPage() {
  const session = await requireUserPage();
  const items = getMistakes(session.userId!, 80);
  const bySubject = new Map<string, typeof items>();
  for (const m of items) {
    if (!bySubject.has(m.subject)) bySubject.set(m.subject, []);
    bySubject.get(m.subject)!.push(m);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[980px] px-5 py-8 lg:px-10 lg:py-12">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Mistake review</div>
        <h1 className="mt-2 font-serif text-[30px] leading-tight sm:text-[36px]">错题本</h1>
        <p className="mt-1 text-sm text-muted">按最近一次作答统计，答错或部分得分的题会留在这里。复盘后可回到原题重做。</p>

        {items.length === 0 ? (
          <div className="mt-8">
            <EmptyState title="暂无错题" desc="做完一组题后，答错或部分得分的题会自动收进这里。" action={<Link href="/practice" className="rounded-lg bg-ink px-4 py-2 text-xs text-paper">去刷题</Link>} />
          </div>
        ) : (
          <div className="mt-7 space-y-8">
            {SUBJECTS.filter(s => bySubject.has(s.id)).map(s => {
              const list = bySubject.get(s.id)!;
              return (
                <div key={s.id}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-lg" style={subjectTint(s.accent)}>
                      <SubjectIcon id={s.id} className="h-3.5 w-3.5" />
                    </span>
                    <h2 className="font-serif text-[15px]">{s.name}</h2>
                    <span className="text-[10px] text-muted">{list.length} 题</span>
                    <div className="h-px flex-1 bg-line" />
                  </div>
                  <div className="space-y-2">
                    {list.map(m => (
                      <Card key={m.questionId} className="p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className={TYPE_COLOR[m.type] || "bg-subtle text-muted"}>{typeLabel(m.type)}</Badge>
                          <span className="text-[10px] text-muted">{m.chapter}</span>
                          <span className="ml-auto rounded-full bg-accent-soft px-2 py-0.5 text-[9px] text-accent">
                            {m.verdict === "partial" ? "部分得分" : "答错"} {m.score ?? 0}/{m.maxScore ?? "?"}
                          </span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-[12.5px] leading-6 text-ink">{(() => { const t = stripMarkdown(m.stem, 120); return t.length >= 12 ? t : `${m.chapter}${m.topic ? " · " + m.topic : ""}`; })()}</p>
                        {m.feedback?.issues?.length ? (
                          <p className="mt-1 text-[10px] leading-5 text-muted">失分点：{m.feedback.issues.slice(0, 2).join("；")}</p>
                        ) : null}
                        <div className="mt-2 flex items-center justify-between text-[10px] text-muted">
                          <span>{relativeTime(m.createdAt)} · {m.paperTitle}</span>
                          <Link href={`/practice/${m.paperId}?q=${m.questionId}`} className="inline-flex items-center gap-1 text-brand hover:underline">
                            回看并重做 <ArrowUpRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
