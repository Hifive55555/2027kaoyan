import syllabus from "@/data/syllabus/2027.json";
import type { QuestionType, SubjectChapter, SubjectConfig, SubjectId } from "./types";

export const SUBJECTS = syllabus.subjects as unknown as SubjectConfig[];

export function getSubject(id: string): SubjectConfig | undefined {
  return SUBJECTS.find(s => s.id === id);
}

export function getMode(subject: SubjectConfig, modeId: string) {
  return subject.modes.find(m => m.id === modeId) || subject.modes[0];
}

export function flattenChapters(chapters: SubjectChapter[]): SubjectChapter[] {
  const out: SubjectChapter[] = [];
  for (const c of chapters) {
    out.push(c);
    if (c.children) for (const child of c.children) out.push(child);
  }
  return out;
}

export function chapterById(subject: SubjectConfig, id: string) {
  return flattenChapters(subject.chapters).find(c => c.id === id);
}

export function chapterNames(subject: SubjectConfig, chapterIds: string[]): string[] {
  const flat = flattenChapters(subject.chapters);
  const names: string[] = [];
  for (const id of chapterIds) {
    const c = flat.find(x => x.id === id);
    if (!c) continue;
    names.push(c.name);
    if (c.children) for (const child of c.children) names.push(child.name);
  }
  return [...new Set(names)];
}

export function primaryChapterName(subject: SubjectConfig, chapterIds: string[]): string {
  const first = chapterById(subject, chapterIds[0]);
  return first?.name || "综合";
}

export const TYPE_LABEL: Record<string, string> = {
  choice: "单项选择",
  multiple: "多项选择",
  fill: "填空",
  solution: "解答",
  single: "单项选择",
  analysis: "材料分析",
  cloze: "完形填空",
  reading: "阅读理解",
  newtype: "新题型",
  translation: "翻译",
  writing: "写作",
  comprehensive: "综合应用",
  short: "简答",
};

export const TYPE_COLOR: Record<string, string> = {
  choice: "bg-brand-soft text-brand",
  multiple: "bg-brand-soft text-brand",
  single: "bg-brand-soft text-brand",
  cloze: "bg-amber-soft text-amber",
  reading: "bg-amber-soft text-amber",
  newtype: "bg-amber-soft text-amber",
  fill: "bg-blue-soft text-blue",
  solution: "bg-accent-soft text-accent",
  analysis: "bg-accent-soft text-accent",
  translation: "bg-accent-soft text-accent",
  writing: "bg-accent-soft text-accent",
  comprehensive: "bg-blue-soft text-blue",
};

export function typeLabel(type: QuestionType | string): string {
  return TYPE_LABEL[type] || String(type);
}

export function isObjectiveType(type: string): boolean {
  return ["choice", "multiple", "single", "cloze", "reading", "newtype"].includes(type);
}

export function isChoiceType(type: string): boolean {
  return ["choice", "single", "cloze", "reading", "newtype"].includes(type);
}

export function isMultiType(type: string): boolean {
  return type === "multiple";
}

export function subjectTint(accent?: string) {
  const a = accent || "#315e4c";
  return {
    backgroundColor: `color-mix(in srgb, ${a} 22%, var(--color-surface))`,
    color: `color-mix(in srgb, ${a} 88%, var(--color-ink))`,
  };
}
