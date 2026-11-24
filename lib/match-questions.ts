import { chatJson } from "./deepseek";
import { sampleBankQuestions } from "./random";

export interface MatchQuestion {
  subject: string;
  chapter: string;
  type: "choice";
  stem: string;
  options: { key: string; text: string }[];
  answer: string;
  explanation: string;
  difficulty: "基础" | "提高" | "冲刺";
  timeLimit: number;
  score: number;
}

const DIFF = {
  "基础": { timeLimit: 30, score: 5 },
  "提高": { timeLimit: 45, score: 8 },
  "冲刺": { timeLimit: 60, score: 10 },
} as const;

function normalize(x: any): MatchQuestion | null {
  const stem = String(x?.stem || "").trim();
  const options = Array.isArray(x?.options)
    ? x.options.map((o: any) => ({ key: String(o?.key || "").toUpperCase().slice(0, 1), text: String(o?.text || "").trim() })).filter((o: any) => o.key && o.text)
    : [];
  const answer = String(x?.answer || "").toUpperCase().replace(/[^A-D]/g, "").slice(0, 1);
  if (!stem || options.length < 2 || !answer) return null;
  const difficulty: "基础" | "提高" | "冲刺" = x?.difficulty === "基础" || x?.difficulty === "冲刺" ? x.difficulty : "提高";
  return {
    subject: ["math2", "english2", "politics", "cs408"].includes(x?.subject) ? x.subject : "politics",
    chapter: String(x?.chapter || "综合").slice(0, 30),
    type: "choice",
    stem: stem.slice(0, 500),
    options: options.slice(0, 4),
    answer,
    explanation: String(x?.explanation || "").slice(0, 1200),
    difficulty,
    ...DIFF[difficulty],
  };
}

function fallback(): MatchQuestion[] {
  return sampleBankQuestions(10).map(q => ({
    subject: q.subject,
    chapter: q.chapter || "综合",
    type: "choice" as const,
    stem: q.stem.slice(0, 500),
    options: q.options.slice(0, 4),
    answer: q.answer,
    explanation: q.explanation || "",
    difficulty: "提高" as const,
    timeLimit: 45,
    score: 8,
  }));
}

export async function generateMatchQuestions(): Promise<MatchQuestion[]> {
  const prompt = `你是 2027 考研 1v1 竞赛的出题人。请生成 10 道“快问快答”单选题，用于两名考生实时 PK。

要求：
- 只出 4 选 1 单选，答案 A—D；不要多选、填空、主观题。
- 题干要短，控制在 80 字以内；选项要短；不要长阅读、代码块、图片、复杂公式堆叠。
- 覆盖：政治 2 题、数学二 2 题、408 3 题、英语二 3 题（英语只考词汇/语法/短语，给一句短句或一个短题干）。
- 数学只考数二大纲；408 考数据结构/计组/操作系统/网络；政治覆盖马原/毛中特/新思想/史纲/思法/时政。
- 难度分布：基础 4、提高 4、冲刺 2。
- 每题只考一个点，能快速判断；解析一句话说清。
- 不得照抄真题；不要出有争议或需要外部时事的细节题。

只输出 JSON：
{"questions":[{"subject":"math2|english2|politics|cs408","chapter":"短章节","stem":"题干","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"answer":"A","explanation":"一句话解析","difficulty":"基础|提高|冲刺"}]}`;

  try {
    const raw = await chatJson<{ questions?: any[] }>([
      { role: "system", content: "你是考研竞赛命题人，只输出 JSON。" },
      { role: "user", content: prompt },
    ], { maxTokens: 10000, temperature: 0.75, timeoutMs: 50000 });
    const list = (raw.questions || []).map(normalize).filter(Boolean) as MatchQuestion[];
    if (list.length >= 7) {
      const fill = fallback();
      while (list.length < 10) list.push(fill[list.length % fill.length]);
      return list.slice(0, 10);
    }
  } catch {
    // fall through to bank fallback
  }
  return fallback();
}
