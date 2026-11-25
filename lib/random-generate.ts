import { chatJson } from "./deepseek";
import { newId, nowIso, getDb } from "./db";
import { SUBJECTS, flattenChapters } from "./subjects";
import { selectExemplars } from "./retrieval";
import { knowledgeExcerpt } from "./knowledge";
import type { GeneratedRandomQuestion, RandomQuestionPublic } from "./random-types";

const FIGURE_REF = /(?:如图|如下图|下图|上图|图所示|图示|见图|题图|图\s*\d)/;
const IMAGE_MD = /!\[[^\]]*\]\([^)]+\)|<img\b/i;

interface RawRandomQuestion {
  chapter?: string;
  topic?: string;
  difficulty?: string;
  stem?: string;
  options?: { key?: string; text?: string }[];
  answer?: string;
  explanation?: string;
}

function clean(value: unknown, max = 1200): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function hasFigureWithoutImage(stem: string, options: string[]): boolean {
  const text = [stem, ...options].join(" ");
  if (!FIGURE_REF.test(text)) return false;
  return !IMAGE_MD.test(text);
}

function normalize(raw: RawRandomQuestion, subjectId: string, subjectName: string, chapter: string): GeneratedRandomQuestion | null {
  const stem = clean(raw.stem, 1600);
  const options = (raw.options || []).map((o, i) => ({
    key: clean(o.key || String.fromCharCode(65 + i), 1).toUpperCase(),
    text: clean(o.text, 500),
  })).filter(o => /^[A-D]$/.test(o.key) && o.text.length >= 1);
  const answer = clean(raw.answer, 4).toUpperCase().replace(/[^A-D]/g, "");
  if (!stem || stem.length < 8 || options.length !== 4 || !/^[A-D]$/.test(answer)) return null;
  if (new Set(options.map(o => o.key)).size !== 4) return null;
  if (new Set(options.map(o => o.text)).size !== 4) return null;
  if (hasFigureWithoutImage(stem, options.map(o => o.text))) return null;
  const correct = options.find(o => o.key === answer);
  if (!correct) return null;
  const topic = clean(raw.topic, 40) || chapter;
  return {
    id: newId("rg"),
    subject: subjectId,
    subjectName,
    year: 0,
    number: 0,
    type: "choice",
    chapter,
    topic,
    difficulty: clean(raw.difficulty, 10) || "基础",
    stem,
    options,
    answer,
    explanation: clean(raw.explanation, 1600) || `正确选项为 ${answer}。`,
    generated: true,
  };
}

export async function generateRandomQuestion(userId: string): Promise<GeneratedRandomQuestion | null> {
  const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
  const chapters = flattenChapters(subject.chapters);
  const chapter = chapters[Math.floor(Math.random() * chapters.length)];
  if (!chapter) return null;
  const exemplars = selectExemplars(subject.id, [chapter.name], 2);
  const knowledge = knowledgeExcerpt(subject.id, chapter.name, 1, 520);
  const englishRule = subject.id === "english2"
    ? "英语二随机题必须是独立的四选一（词汇/语法/短语/短句理解），不能依赖阅读文章；题干给出足够语境。"
    : "";
  const raw = await chatJson<RawRandomQuestion>([
    {
      role: "system",
      content: `你是「备考台」随机刷题命题人。为 2027 考研生成一道可独立作答的四选一练习题。
${englishRule}
硬性要求：
- 只能使用文字，不能依赖任何图片、图表、示意图；题干和选项绝对不要出现“如图、下图、上图、图中、图所示、见图、题图”等指图词语。
- 必须有且只有一个正确选项；四个选项互不重复；答案只能是 A/B/C/D。
- 不要照抄参考题；可以改变数值、情境和问法。
- 解析简短但完整，说明为什么正确、为什么其他选项错。
- 只输出 JSON，不要代码围栏。`,
    },
    {
      role: "user",
      content: `【科目】${subject.name}（${subject.code}）
【章节】${chapter.name}
【难度】基础或提高
【真题风格参考（只学考法，禁止照抄）】
${exemplars.map((e, i) => `【参考 ${i + 1}】${e.year} 年第 ${e.number} 题（${e.chapter}）\n题干：${e.stem}\n答案：${e.answer}\n解析：${e.explanation}`).join("\n\n") || "（无）"}
${knowledge ? `\n【本地知识点参考】\n${knowledge}` : ""}

输出 JSON：
{"chapter":"${chapter.name}","topic":"具体考点，10字内","difficulty":"基础|提高","stem":"题干","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"answer":"A","explanation":"解析"}`,
    },
  ], { maxTokens: 2200, temperature: 0.82, timeoutMs: 90000, effort: "medium" });

  const question = normalize(raw, subject.id, subject.short || subject.name, chapter.name);
  if (!question) return null;
  const db = getDb();
  db.prepare(
    `INSERT INTO random_generated_questions (id, user_id, subject, chapter, payload, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(question.id, userId, question.subject, question.chapter, JSON.stringify(question), nowIso());
  return question;
}
