import { chatJson } from "./deepseek";
import { buildGenerationMessages } from "./prompts";
import { corpusExcerpt, selectExemplars } from "./retrieval";
import { createPaper, getRecentStems, getWeakChapters, type GeneratedQuestion, type GeneratedSection } from "./queries";
import { chapterById, chapterNames, flattenChapters, getMode, getSubject } from "./subjects";
import type { PracticeMode, QuestionPlan, SubjectChapter, SubjectConfig, SubjectId } from "./types";

interface RawQuestion {
  type?: string;
  chapter?: string;
  topic?: string;
  stem?: string;
  options?: { key?: string; text?: string }[];
  answer?: unknown;
  explanation?: string;
  score?: number;
  difficulty?: string;
  rubric?: string[];
  sourceNote?: string;
}

interface RawPaper {
  title?: string;
  durationMin?: number;
  sections?: { label?: string; material?: string; questions?: RawQuestion[] }[];
}

interface Task {
  plan: QuestionPlan;
  chapters: string[];
  labelHint?: string;
  maxTokens: number;
  seedYear?: number;
}

const ALLOWED_TYPES = new Set([
  "choice", "multiple", "fill", "solution", "single", "analysis", "cloze", "reading",
  "newtype", "translation", "writing", "comprehensive", "short",
]);

function normalizeType(t: string | undefined, subject: SubjectId): string {
  const raw = String(t || "").toLowerCase();
  if (ALLOWED_TYPES.has(raw)) return raw;
  if (/multi/.test(raw)) return "multiple";
  if (/single|choice|选择/.test(raw)) return subject === "english2" ? "reading" : "choice";
  if (/fill|填空/.test(raw)) return "fill";
  if (/solution|解答|计算|证明/.test(raw)) return "solution";
  if (/analysis|分析/.test(raw)) return "analysis";
  if (/comp|综合/.test(raw)) return "comprehensive";
  return subject === "english2" ? "reading" : "choice";
}

function tokensFor(type: string, count: number): number {
  if (type === "solution") return count <= 2 ? 12000 : 24000;
  if (type === "reading") return 11000;
  if (type === "cloze") return count > 10 ? 16000 : 9000;
  if (type === "newtype") return 9000;
  if (type === "translation") return 4500;
  if (type === "writing") return 6500;
  if (type === "analysis") return count <= 1 ? 7000 : 20000;
  if (type === "comprehensive") return count <= 2 ? 14000 : 26000;
  if (type === "choice") return count > 20 ? 20000 : count > 10 ? 12000 : 8000;
  if (type === "multiple") return 12000;
  if (type === "single") return 10000;
  if (type === "fill") return 7000;
  return 9000;
}

function splitCounts(total: number, weights: number[]): number[] {
  if (total <= 0) return weights.map(() => 0);
  const sum = weights.reduce((a, b) => a + b, 0) || weights.length;
  const exact = weights.map(w => (total * w) / sum);
  const base = exact.map(Math.floor);
  let rem = total - base.reduce((a, b) => a + b, 0);
  const order = exact.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem; k++) base[order[k % order.length].i]++;
  // ensure every selected group gets at least one when possible
  if (total >= weights.length) {
    for (let i = 0; i < base.length; i++) {
      if (base[i] === 0) {
        const donor = base.map((v, j) => ({ v, j })).filter(x => x.v > 1).sort((a, b) => b.v - a.v)[0];
        if (donor) { base[donor.j]--; base[i]++; }
      }
    }
  }
  return base;
}

function expandTasks(subject: SubjectConfig, mode: PracticeMode, ids: string[], names: string[]): Task[] {
  if (subject.id === "english2") {
    const tasks: Task[] = [];
    for (const p of mode.plan) {
      if (p.type === "reading" && p.count > 5) {
        const n = Math.ceil(p.count / 5);
        for (let i = 0; i < n; i++) {
          tasks.push({ plan: { ...p, count: 5 }, chapters: [names[0] || "阅读理解 A"], labelHint: `Text ${i + 1}`, maxTokens: tokensFor("reading", 5), seedYear: 2026 - i });
        }
      } else if (p.type === "writing" && p.count >= 2) {
        tasks.push({ plan: { ...p, count: 1, score: 10 }, chapters: names, labelHint: "Part A 应用文", maxTokens: tokensFor("writing", 1) });
        tasks.push({ plan: { ...p, count: 1, score: 15 }, chapters: names, labelHint: "Part B 短文", maxTokens: tokensFor("writing", 1) });
      } else {
        tasks.push({ plan: p, chapters: names, labelHint: p.name, maxTokens: tokensFor(p.type, p.count) });
      }
    }
    return tasks;
  }

  if (subject.id === "cs408") {
    const parents = subject.chapters.filter(parent => {
      const childIds = parent.children?.map(c => c.id) || [];
      return ids.includes(parent.id) || childIds.some(id => ids.includes(id));
    });
    const selected = parents.length ? parents : subject.chapters;
    const choicePlan = mode.plan.find(p => p.type === "choice");
    const compPlan = mode.plan.find(p => p.type === "comprehensive");
    const tasks: Task[] = [];
    const weight = (c: SubjectChapter) => c.weight || 25;
    const parentNames = (c: SubjectChapter) => {
      if (ids.includes(c.id)) return [c.name, ...(c.children?.map(x => x.name) || [])];
      const picked = (c.children || []).filter(x => ids.includes(x.id)).map(x => x.name);
      return picked.length ? picked : [c.name];
    };

    if (choicePlan) {
      let counts: number[];
      if (selected.length === subject.chapters.length && choicePlan.count >= 40) {
        const fixed: Record<string, number> = { "cs408-ds": 11, "cs408-co": 11, "cs408-os": 10, "cs408-net": 8 };
        counts = selected.map(c => fixed[c.id] || 0);
      } else {
        counts = splitCounts(choicePlan.count, selected.map(weight));
      }
      selected.forEach((c, i) => {
        if (counts[i] > 0) tasks.push({
          plan: { ...choicePlan, count: counts[i] },
          chapters: parentNames(c),
          labelHint: `${c.name} · 选择题`,
          maxTokens: tokensFor("choice", counts[i]),
        });
      });
    }
    if (compPlan) {
      let counts: number[];
      if (selected.length === subject.chapters.length && compPlan.count >= 7) {
        const fixed: Record<string, number> = { "cs408-ds": 2, "cs408-co": 2, "cs408-os": 2, "cs408-net": 1 };
        counts = selected.map(c => fixed[c.id] || 0);
      } else {
        counts = splitCounts(compPlan.count, selected.map(weight));
      }
      selected.forEach((c, i) => {
        if (counts[i] > 0) tasks.push({
          plan: { ...compPlan, count: counts[i] },
          chapters: parentNames(c),
          labelHint: `${c.name} · 综合应用题`,
          maxTokens: tokensFor("comprehensive", counts[i]),
        });
      });
    }
    return tasks;
  }

  return mode.plan.map(p => ({ plan: p, chapters: names, labelHint: p.name, maxTokens: tokensFor(p.type, p.count) }));
}

function normalizeTask(subject: SubjectConfig, mode: PracticeMode, task: Task, raw: RawPaper): GeneratedSection[] {
  const sections: GeneratedSection[] = [];
  for (const s of raw.sections || []) {
    const qs: GeneratedQuestion[] = [];
    for (const q of s.questions || []) {
      const stem = String(q.stem || "").trim();
      if (!stem) continue;
      const type = task.plan.type || normalizeType(q.type, subject.id);
      const options = (q.options || [])
        .map(o => ({ key: String(o.key || "").replace(/[^A-Z]/g, "").slice(0, 1), text: String(o.text || "").trim() }))
        .filter(o => o.key && o.text);
      let answerValue: unknown = q.answer;
      if (Array.isArray(answerValue)) answerValue = answerValue.join("");
      const answer = String(answerValue ?? "").trim();
      const chapter = task.chapters.find(n => String(q.chapter || "").includes(n)) || task.chapters[0] || subject.name;
      const fixedScore = task.plan.score > 0 && ["choice", "single", "multiple", "fill", "cloze", "reading", "newtype", "translation"].includes(task.plan.type);
      qs.push({
        type,
        chapter,
        topic: String(q.topic || chapter).slice(0, 40),
        stem,
        options,
        answer,
        explanation: String(q.explanation || "").trim(),
        score: fixedScore ? task.plan.score : (Number(q.score) > 0 ? Number(q.score) : 0),
        difficulty: ["基础", "提高", "冲刺"].includes(String(q.difficulty)) ? String(q.difficulty) : "提高",
        rubric: Array.isArray(q.rubric) ? q.rubric.map(String).filter(Boolean) : [],
        sourceNote: q.sourceNote || "AI 原创题 · 2027 大纲",
      });
    }
    if (qs.length) sections.push({
      label: String(s.label || task.labelHint || "练习").trim(),
      material: String(s.material || "").trim(),
      questions: qs,
    });
  }

  // Normalize scores for subjectives that have a fixed group total
  const all = sections.flatMap(s => s.questions);
  if (all.length && ["solution", "analysis", "comprehensive"].includes(task.plan.type)) {
    const per = task.plan.type === "solution"
      ? (task.plan.count >= 6 ? 70 / task.plan.count : 10)
      : 10;
    const target = per * task.plan.count;
    const current = all.reduce((a, q) => a + q.score, 0);
    if (current > 0 && Math.abs(current - target) > 0.01) {
      const scale = target / current;
      for (const q of all) q.score = Math.round(q.score * scale * 2) / 2;
    } else if (current === 0) {
      const each = target / all.length;
      for (const q of all) q.score = Math.round(each * 2) / 2;
    }
  }
  if (task.plan.type === "writing" && all.length === 1) {
    all[0].score = task.plan.score || 15;
  }
  return sections;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const i = cursor++;
      if (i >= items.length) break;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function generatePaper(input: {
  userId: string;
  subjectId: SubjectId;
  chapterIds: string[];
  modeId: string;
}): Promise<{ paperId: string; title: string; count: number }> {
  const subject = getSubject(input.subjectId);
  if (!subject) throw new Error("未知科目");
  const mode = getMode(subject, input.modeId);
  if (!mode) throw new Error("未知练习模式");
  const allChapters = flattenChapters(subject.chapters);
  const requested = input.chapterIds.length ? input.chapterIds : [subject.chapters[0].id];
  const ids = requested.filter(id => allChapters.some(c => c.id === id));
  if (!ids.length) ids.push(subject.chapters[0].id);
  const names = chapterNames(subject, ids);
  const weakTopics = getWeakChapters(input.userId, subject.id, 3);
  const avoid = getRecentStems(input.userId, subject.id, 10);
  const tasks = expandTasks(subject, mode, ids, names);
  const targetCount = mode.plan.reduce((s, p) => s + p.count, 0);

  const results = await mapLimit(tasks, 3, async (task) => {
    const exemplars = selectExemplars(subject.id, task.chapters, 3);
    const englishExcerpt = subject.id === "english2" ? corpusExcerpt(subject.id, task.chapters[0] || "", task.seedYear) : "";
    const messages = buildGenerationMessages({
      subject, mode, chapterNames: task.chapters, exemplars, englishExcerpt, weakTopics, avoid,
      planOverride: [task.plan], labelHint: task.labelHint,
    });
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await chatJson<RawPaper>(messages, {
          maxTokens: task.maxTokens,
          temperature: attempt === 0 ? 0.8 : 0.55,
          timeoutMs: 260000,
        });
        const sections = normalizeTask(subject, mode, task, raw);
        const count = sections.reduce((a, s) => a + s.questions.length, 0);
        if (count >= Math.max(1, Math.ceil(task.plan.count * 0.6))) return sections;
        lastErr = new Error(`题量不足：${task.labelHint} 期望 ${task.plan.count} 题，实际 ${count} 题`);
      } catch (err) {
        lastErr = err;
      }
      await new Promise(r => setTimeout(r, 800));
    }
    throw lastErr instanceof Error ? lastErr : new Error(`${task.labelHint} 生成失败`);
  });

  const sections = results.flat();
  const count = sections.reduce((a, s) => a + s.questions.length, 0);
  if (!sections.length) throw new Error("模型未返回有效题目，请重试");

  const selectedNames = ids.map(id => chapterById(subject, id)?.name).filter(Boolean) as string[];
  const selectedTitle = selectedNames.length > 3 ? "综合" : selectedNames.join("、") || subject.name;
  const shownTitle = selectedTitle.length > 22 ? selectedTitle.slice(0, 22) + "…" : selectedTitle;
  const title = `${subject.short} · ${shownTitle} · ${mode.name}`;
  const paperId = createPaper({
    userId: input.userId,
    subject: subject.id,
    chapter: selectedTitle,
    chapterIds: ids,
    mode: mode.id,
    title,
    durationMin: mode.minutes,
    sections,
    blueprint: {
      plan: mode.plan,
      tasks: tasks.map(t => ({ type: t.plan.type, count: t.plan.count, label: t.labelHint })),
      targetCount,
      generatedCount: count,
      model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
      syllabus: "2027",
    },
  });

  return { paperId, title, count };
}
