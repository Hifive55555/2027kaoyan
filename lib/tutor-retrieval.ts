import fs from "node:fs";
import path from "node:path";
import { getTutorRoadmap } from "./queries";
import type { SubjectId } from "./types";

type BankQuestion = {
  id: string;
  subject: SubjectId;
  year: number;
  number: number;
  type: string;
  chapter: string;
  topic?: string;
  stem: string;
  options?: { key: string; text: string }[];
  answer?: unknown;
  explanation?: string;
};

type Bank = { meta: { subject: string; name: string; years: number[]; count: number }; questions: BankQuestion[] };

declare global {
  var __tutorBanks: Map<string, Bank> | undefined;
}

const STOP = new Set([
  "这个", "部分", "历年", "没有", "考题", "还是", "只是", "需要", "掌握", "概念", "就行",
  "为什么", "怎么", "什么", "哪些", "哪个", "如何", "可以", "应该", "我们", "老师", "帮我",
  "讲讲", "一下", "问题", "这个部分", "有没有", "是不是", "以及", "相关", "内容", "知识",
]);

const SUBJECT_LABEL: Record<string, string> = {
  math2: "数学二", english2: "英语二", politics: "政治", cs408: "408",
};

function banks(): Bank[] {
  if (!globalThis.__tutorBanks) globalThis.__tutorBanks = new Map();
  const cache = globalThis.__tutorBanks;
  for (const subject of ["math2", "english2", "politics", "cs408"]) {
    if (cache.has(subject)) continue;
    const file = path.join(process.cwd(), "data/bank", `${subject}.json`);
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8")) as Bank;
      data.questions = (data.questions || []).map(q => ({ ...q, subject: subject as SubjectId }));
      cache.set(subject, data);
    } catch { /* optional bank */ }
  }
  return [...cache.values()];
}

function compact(s: unknown, max: number): string {
  return String(s ?? "").replace(/[#*`_>]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
}

function termsOf(query: string): string[] {
  const chunks = query
    .toLowerCase()
    .replace(/[，。！？；：、,.!?;:()（）【】\[\]《》"“”‘’\s]/g, " ")
    .split(/\s+|以及|关于|这个|部分|历年|没有|考题|还是|只是|需要|掌握|概念|就行|为什么|怎么|什么|哪些|哪个|如何|可以|应该|我们|老师|帮我|讲讲|一下|的|和|与|及|或|是|有|吗|呢|吧|啊/g)
    .map(s => s.trim())
    .filter(s => s.length >= 2 && !STOP.has(s));
  const out = new Set<string>();
  for (const chunk of chunks) {
    if (/^[a-z0-9+#.]+$/i.test(chunk)) { if (chunk.length >= 2) out.add(chunk); continue; }
    const max = Math.min(4, chunk.length);
    for (let len = 2; len <= max; len++) {
      for (let i = 0; i + len <= chunk.length; i++) out.add(chunk.slice(i, i + len));
    }
  }
  return [...out].slice(0, 32);
}

function scoreQuestion(q: BankQuestion, terms: string[]): number {
  const chapter = `${q.chapter} ${q.topic || ""}`.toLowerCase();
  const stem = String(q.stem || "").toLowerCase();
  const expl = String(q.explanation || "").toLowerCase();
  const options = (q.options || []).map(o => `${o.key} ${o.text}`).join(" ").toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (term.length < 2) continue;
    if (chapter.includes(term)) score += 5;
    else if (stem.includes(term)) score += 2;
    else if (options.includes(term)) score += 1;
    else if (expl.includes(term)) score += 1;
  }
  return score;
}

function syllabusExcerpts(terms: string[]): string[] {
  const dir = path.join(process.cwd(), "data/syllabus");
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith("-2027.md"))) {
    const text = fs.readFileSync(path.join(dir, file), "utf8");
    const lines = text.split("\n");
    let best = { score: 0, line: "" };
    for (const line of lines) {
      if (line.trim().length < 4) continue;
      const score = terms.reduce((n, term) => n + (line.includes(term) ? 1 : 0), 0);
      if (score > best.score) best = { score, line: line.trim() };
    }
    if (best.score > 0) out.push(`${file.replace("-2027.md", "")}：${compact(best.line, 180)}`);
  }
  return out.slice(0, 3);
}

function roadmapTerms(userId: string): string[] {
  const items = getTutorRoadmap(userId);
  const active = items.filter(i => i.status === "in_progress");
  const pending = items.filter(i => i.status === "pending").slice(0, 2);
  return [...active, ...pending].map(i => i.title);
}

export function getTutorRetrievalContext(userId: string, message: string): string {
  const query = [message, ...roadmapTerms(userId)].join(" ");
  const terms = termsOf(query);
  if (!terms.length) return "";
  const all: { q: BankQuestion; score: number }[] = [];
  for (const bank of banks()) {
    for (const q of bank.questions) {
      const score = scoreQuestion(q, terms);
      if (score >= 3) all.push({ q, score });
    }
  }
  all.sort((a, b) => b.score - a.score || b.q.year - a.q.year);
  const hits = all.slice(0, 60);
  if (!hits.length) return `【本地题库检索】未找到明确匹配的历年题。不要据此断言“没有考过”；可提示用户换关键词或联网搜索。`;
  const byYear = new Map<number, number>();
  for (const h of hits) byYear.set(h.q.year, (byYear.get(h.q.year) || 0) + 1);
  const years = [...byYear.entries()].sort((a, b) => b[0] - a[0]).slice(0, 15)
    .map(([y, n]) => `${y}(${n})`).join("、");
  const samples = hits.slice(0, 8).map(({ q }) => {
    const ans = compact(q.answer, 40);
    return `- ${q.year} 年第 ${q.number} 题 [${SUBJECT_LABEL[q.subject] || q.subject}·${q.chapter || ""}] ${compact(q.stem, 120)}${ans ? `（答案：${ans}）` : ""}`;
  }).join("\n");
  const syllabus = syllabusExcerpts(terms);
  return `【本地题库检索（自动）】
匹配 ${all.length} 道；年份分布：${years || "无"}。
代表题：
${samples}
${syllabus.length ? `【2027 大纲相关】\n${syllabus.join("\n")}` : ""}`;
}
