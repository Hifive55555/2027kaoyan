import { chatJson } from "./deepseek";
import { appendSection, getPaper, getQuestion } from "./queries";
import { getSubjectSafe } from "./grade-helpers";
import { chapterNames } from "./subjects";
import type { GeneratedSection } from "./queries";

interface RawSimilar {
  sections?: { label?: string; material?: string; questions?: any[] }[];
}

function countFor(type: string): number {
  if (type === "reading") return 5;
  if (type === "cloze") return 10;
  if (type === "newtype") return 5;
  return 1;
}

export async function generateSimilar(questionId: string, userId: string): Promise<{ paperId: string; newQuestionIds: string[] }> {
  const q = getQuestion(questionId);
  if (!q || q.paperUserId !== userId) throw new Error("题目不存在");
  const subject = getSubjectSafe(q.paperSubject);
  if (!subject) throw new Error("科目配置缺失");
  const n = countFor(q.type);
  const isReading = q.type === "reading";
  const isCloze = q.type === "cloze";
  const system = `你是 2027 考研${subject.name}命题人。学生刚做完一道题，需要一道同章节、同题型、同难度但不同设问/数字/材料的“同类题”。

要求：
- 不得照抄原题；题干、数据、材料必须明显不同。
- 保持原题的考法、难度和评分标准。
- ${isReading ? "生成一篇新的 400—450 词英语文章 + 5 道阅读题；文章话题与原题不同。" : isCloze ? "生成一篇新的约 350 词英语文章 + 10 个完形填空，编号 ___1___ 到 ___10___。" : `只生成 1 道题（${q.type}）。`}
- 数学公式用 LaTeX；代码用 markdown 代码块。
- 只输出 JSON：{"sections":[{"label":"...","material":"...","questions":[{"type":"...","chapter":"...","topic":"...","stem":"...","options":[{"key":"A","text":"..."}],"answer":"...","explanation":"...","score":${q.score},"difficulty":"...","rubric":["..."]}]}]}。
- answer 必须是可判定的标准答案；解析要完整。`;

  const user = `【原题】
类型：${q.type}
章节：${q.chapter}
考点：${q.topic}
满分：${q.score}
题干：${q.stem}
${q.options.length ? `选项：\n${q.options.map(o => `${o.key}. ${o.text}`).join("\n")}` : ""}
标准答案：${q.answerRaw}
解析：${q.explanation}

请生成 ${n} 道同类题（若为阅读/完形，则 1 篇文章 + ${n} 道小题）。`;

  const raw = await chatJson<RawSimilar>([
    { role: "system", content: system },
    { role: "user", content: user },
  ], { maxTokens: 10000, temperature: 0.8, timeoutMs: 180000 });

  const rawSection = raw.sections?.[0];
  if (!rawSection?.questions?.length) throw new Error("同类题生成失败，请重试");
  const questions = rawSection.questions.slice(0, n).map((x, i) => ({
    type: String(x.type || q.type),
    chapter: String(x.chapter || q.chapter),
    topic: String(x.topic || q.topic),
    stem: String(x.stem || "").trim(),
    options: Array.isArray(x.options) ? x.options.map((o: any) => ({ key: String(o.key || ""), text: String(o.text || "") })) : [],
    answer: Array.isArray(x.answer) ? x.answer.join("") : String(x.answer ?? ""),
    explanation: String(x.explanation || ""),
    score: Number(x.score) > 0 ? Number(x.score) : q.score,
    difficulty: String(x.difficulty || q.difficulty),
    rubric: Array.isArray(x.rubric) ? x.rubric.map(String) : [],
    sourceNote: "AI 同类题 · 2027 大纲",
  })).filter((x: any) => x.stem);
  if (!questions.length) throw new Error("同类题生成失败，请重试");

  const section: GeneratedSection = {
    label: `同类题 · ${q.topic || q.chapter}`,
    material: String(rawSection.material || ""),
    questions,
  };
  const newQuestionIds = appendSection(q.paperId, section);
  return { paperId: q.paperId, newQuestionIds };
}
