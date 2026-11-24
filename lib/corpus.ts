import fs from "node:fs";
import path from "node:path";
import { SUBJECTS } from "./subjects";
import type { SubjectId } from "./types";

const CORPUS = path.join(process.cwd(), "data/corpus");

export interface CorpusMeta {
  subject: SubjectId;
  name: string;
  code: string;
  years: number[];
  count: number | null;
  note: string;
}

export function corpusMeta(subject: SubjectId): CorpusMeta {
  const config = SUBJECTS.find(s => s.id === subject)!;
  const dir = path.join(CORPUS, subject);
  let years: number[] = [];
  if (fs.existsSync(dir)) {
    years = fs.readdirSync(dir)
      .filter(f => /^\d{4}\.md$/.test(f))
      .map(f => Number(f.slice(0, 4)))
      .sort((a, b) => a - b);
  }
  let count: number | null = null;
  const bankFile = path.join(process.cwd(), "data/bank", `${subject}.json`);
  if (fs.existsSync(bankFile)) {
    try {
      const bank = JSON.parse(fs.readFileSync(bankFile, "utf8"));
      count = bank.meta?.count ?? null;
    } catch { /* ignore */ }
  }
  return {
    subject,
    name: config.name,
    code: config.code,
    years,
    count,
    note: subject === "english2" ? "英语二自 2010 年开考" : subject === "cs408" ? "408 自 2009 年开考" : "2006—2026 年",
  };
}

export function allCorpusMeta(): CorpusMeta[] {
  return (["math2", "english2", "politics", "cs408"] as SubjectId[]).map(corpusMeta);
}

export function readCorpus(subject: SubjectId, year: number): { content: string; meta: Record<string, string> } | null {
  const file = path.join(CORPUS, subject, `${year}.md`);
  if (!fs.existsSync(file)) return null;
  let text = fs.readFileSync(file, "utf8");
  const meta: Record<string, string> = {};
  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---\n", 4);
    if (end > 0) {
      const header = text.slice(4, end);
      for (const line of header.split("\n")) {
        const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
        if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
      text = text.slice(end + 5);
    }
  }
  return { content: text.trim(), meta };
}

export function subjectName(subject: string): string {
  return SUBJECTS.find(s => s.id === subject)?.name || subject;
}
