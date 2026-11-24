import fs from "node:fs";
import path from "node:path";
import type { SubjectConfig, SubjectId } from "./types";

const ROOT = process.cwd();
const BANK_DIR = path.join(ROOT, "data/bank");
const CORPUS_DIR = path.join(ROOT, "data/corpus");

type BankQuestion = {
  id: string;
  year: number;
  number: number;
  type: string;
  chapter: string;
  topic?: string;
  stem: string;
  answer: string;
  explanation?: string;
};

type Bank = { meta: { count: number; years: number[] }; questions: BankQuestion[] };

declare global {
  var __yantuBanks: Map<string, Bank> | undefined;
}

function loadBank(subject: SubjectId): Bank | null {
  if (!globalThis.__yantuBanks) globalThis.__yantuBanks = new Map();
  const cache = globalThis.__yantuBanks;
  if (cache.has(subject)) return cache.get(subject)!;
  const file = path.join(BANK_DIR, `${subject}.json`);
  if (!fs.existsSync(file)) return null;
  try {
    const bank = JSON.parse(fs.readFileSync(file, "utf8")) as Bank;
    cache.set(subject, bank);
    return bank;
  } catch {
    return null;
  }
}

function matchChapter(q: BankQuestion, names: string[]): boolean {
  const text = `${q.chapter} ${q.topic || ""}`;
  return names.some(n => n && text.includes(n));
}

export interface Exemplar {
  year: number;
  number: number;
  type: string;
  chapter: string;
  stem: string;
  answer: string;
  explanation: string;
}

export function selectExemplars(subject: SubjectId, chapterNames: string[], limit = 4): Exemplar[] {
  const bank = loadBank(subject);
  if (!bank) return [];
  const pool = bank.questions.filter(q => chapterNames.length === 0 || matchChapter(q, chapterNames));
  if (!pool.length) {
    const fallback = bank.questions.slice(-limit * 10);
    return fallback.slice(-limit).map(toExemplar);
  }
  const byYear = new Map<number, BankQuestion[]>();
  for (const q of pool) {
    if (!byYear.has(q.year)) byYear.set(q.year, []);
    byYear.get(q.year)!.push(q);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);
  const out: Exemplar[] = [];
  // newest 3 years, then every 3rd year to broaden coverage
  const pickedYears = [...years.slice(0, 3), ...years.slice(3).filter((_, i) => i % 3 === 0)];
  for (const y of pickedYears) {
    const list = byYear.get(y)!;
    const q = list[Math.floor(list.length / 2)];
    if (q) out.push(toExemplar(q));
    if (out.length >= limit) break;
  }
  return out;
}

function toExemplar(q: BankQuestion): Exemplar {
  return {
    year: q.year,
    number: q.number,
    type: q.type,
    chapter: q.chapter,
    stem: String(q.stem).slice(0, 900),
    answer: String(q.answer || "").slice(0, 400),
    explanation: String(q.explanation || "").slice(0, 700),
  };
}

export function corpusExcerpt(subject: SubjectId, chapterName: string, seedYear?: number): string {
  const fileMap: Record<string, string> = {
    "完形填空": "cloze.md",
    "阅读理解 A": "reading-text-1.md",
    "新题型": "new-question-type.md",
    "翻译": "translation.md",
    "写作": "writing.md",
  };
  const sub = fileMap[chapterName];
  if (!sub) return "";
  const dir = path.join(CORPUS_DIR, "english2");
  if (!fs.existsSync(dir)) return "";
  const allYears = fs.readdirSync(dir).filter(f => /^\d{4}$/.test(f)).sort().reverse();
  const years = seedYear ? [String(seedYear), ...allYears.filter(y => y !== String(seedYear))] : allYears;
  for (const y of years) {
    const f = path.join(dir, y, sub);
    if (!fs.existsSync(f)) continue;
    let text = fs.readFileSync(f, "utf8").replace(/^# .*\n/, "").trim();
    text = text.replace(/<!-- echo-enrichment:start -->[\s\S]*$/, "").trim();
    return `【${y} 年真题示例】\n${text.slice(0, 2200)}`;
  }
  return "";
}

export function getSubjectConfig(subject: SubjectId, subjects: SubjectConfig[]): SubjectConfig | undefined {
  return subjects.find(s => s.id === subject);
}
