import fs from "node:fs";
import path from "node:path";
import { Check, ChevronDown, Compass } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { SubjectIcon } from "@/components/SubjectIcon";
import { Markdown } from "@/components/Markdown";
import { Card } from "@/components/ui";
import { SUBJECTS , subjectTint } from "@/lib/subjects";

export const dynamic = "force-dynamic";

export default function SyllabusPage() {
  const raw: Record<string, string> = {};
  for (const s of SUBJECTS) {
    const f = path.join(process.cwd(), "data/syllabus", `${s.id}-2027.md`);
    if (fs.existsSync(f)) raw[s.id] = fs.readFileSync(f, "utf8");
  }
  return (
    <AppShell>
      <div className="mx-auto max-w-[980px] px-5 py-8 lg:px-10 lg:py-12">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted">2027 syllabus</div>
        <h1 className="mt-2 font-serif text-[30px] leading-tight sm:text-[36px]">2027 考试大纲</h1>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
          已按 2027 版大纲整理题型、分值与章节。生成题目时会自动带入对应科目的结构和高频考点。
        </p>

        <div className="mt-7 space-y-4">
          {SUBJECTS.map(s => (
            <Card key={s.id} id={s.id} className="scroll-mt-24 overflow-hidden">
              <div className="flex items-start gap-3 p-5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={subjectTint(s.accent)}>
                  <SubjectIcon id={s.id} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <h2 className="font-serif text-[19px]">{s.name}</h2>
                    <span className="font-mono text-[10px] text-muted">{s.code}</span>
                    <span className="text-[10px] text-muted">{s.duration} 分钟 · {s.totalScore} 分</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-5 text-muted">{s.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                    {s.structure.map((p, i) => (
                      <span key={i} className="rounded-full bg-subtle px-2.5 py-1 text-muted">{p.name} {p.count} {p.score ? `× ${p.score} 分` : "题"}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid gap-4 border-t border-line bg-surface-3 p-5 sm:grid-cols-2">
                <div>
                  <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-muted"><Compass className="h-3.5 w-3.5 text-accent" /> 2027 关注点</div>
                  <ul className="mt-2 space-y-1.5 text-[11px] leading-5 text-muted">
                    {s.highlights.map((h, i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 h-3 w-3 shrink-0 text-brand" /> {h}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">章节结构</div>
                  <div className="mt-2 space-y-1.5 text-[11px] leading-5">
                    {s.chapters.map(c => (
                      <div key={c.id}>
                        <span className="font-medium text-ink">{c.name}</span>
                        {c.children && <span className="text-muted"> · {c.children.map(x => x.name).join(" / ")}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {raw[s.id] && (
                <details className="group border-t border-line">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-[11px] font-medium text-ink">
                    查看大纲原文
                    <ChevronDown className="h-3.5 w-3.5 text-muted transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="max-h-[520px] overflow-y-auto border-t border-line bg-surface px-5 py-4">
                    <Markdown className="text-[12px] leading-6">{raw[s.id]}</Markdown>
                  </div>
                </details>
              )}
            </Card>
          ))}
        </div>

        <p className="mt-6 text-[10px] leading-5 text-faint">
          大纲原文整理自公开版本，最终以教育部教育考试院发布的 2027 年官方大纲为准。
        </p>
      </div>
    </AppShell>
  );
}
