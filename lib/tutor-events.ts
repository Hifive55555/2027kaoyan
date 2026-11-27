import type { TutorCheckPublic, TutorQuizPublic } from "./types";

export interface AnswerContext {
  /** User turns that happened after the card was issued. 0 = answered right away. */
  turnsAfter: number;
  /** Short snippets of what the student asked in between. */
  topics: string[];
}

const SUBJECT_LABEL: Record<string, string> = {
  math2: "数学二", english2: "英语二", politics: "政治", cs408: "408",
};

function clip(text: unknown, max: number): string {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function choiceText(options: { key: string; text: string }[], key: string): string {
  const clean = String(key || "").trim().toUpperCase();
  const hit = options.find(option => option.key.toUpperCase() === clean);
  return hit ? `${clean}（${clip(hit.text, 40)}）` : clean;
}

function positionLine(context: AnswerContext): string {
  const asked = context.topics.length ? `，期间学生又问过「${context.topics.join("」「")}」` : "";
  return `位置：本题是 ${context.turnsAfter} 轮对话之前发出的${asked}；作答的是这一道，不是最近在聊的话题。`;
}

/**
 * The teacher always knows the quiz id server-side, so the event never carries
 * an id. An answer given right after the card keeps the original one-line
 * event; an answer that arrives after the conversation moved on repeats the
 * question so the teacher cannot bind it to the wrong topic. No verdict: the
 * model compares the student's choice with the reference answer itself.
 */
export function buildQuizAnswerEvent(input: {
  quiz: TutorQuizPublic & { answer?: string };
  answer: string;
  correct: boolean;
  context: AnswerContext;
}): { chip: string; event: string } {
  const { quiz, answer, correct, context } = input;
  const topic = clip(quiz.topic || quiz.chapter || "巩固题", 30);
  const chip = `${topic} · ${correct ? "答对" : "答错"}`;
  if (context.turnsAfter === 0) {
    return { chip, event: `【系统事件】学生提交了答案：${answer}` };
  }
  const options = quiz.options || [];
  const lines = [
    "【系统事件 · 学生作答】这不是学生原话。",
    `题目：${topic}（${SUBJECT_LABEL[quiz.subject] || quiz.subject} · ${quiz.chapter || "综合"} · ${quiz.difficulty}）`,
    `题干：${clip(quiz.stem, 200)}`,
  ];
  const optionLine = options.map(option => `${option.key} ${clip(option.text, 40)}`).join(" / ");
  if (optionLine) lines.push(`选项：${optionLine}`);
  lines.push(`学生选择：${choiceText(options, answer)}`);
  if (quiz.answer) lines.push(`参考答案：${choiceText(options, quiz.answer)}`);
  lines.push(positionLine(context));
  return { chip, event: lines.join("\n") };
}

export function buildCheckAnswerEvent(input: {
  check: TutorCheckPublic & { answer?: string };
  response: string;
  context: AnswerContext;
}): { chip: string; event: string } {
  const { check, response, context } = input;
  const chip = `${clip(check.prompt, 12)} · 已作答`;
  if (context.turnsAfter === 0) {
    return { chip, event: `【系统事件】学生提交了答案：${response}` };
  }
  const lines = [
    "【系统事件 · 学生作答】这不是学生原话。",
    `题目：${clip(check.prompt, 160)}`,
  ];
  if (check.kind === "yesno" && check.options.length) {
    lines.push(`选项：${check.options.map((option, index) => `${index + 1} ${clip(option, 30)}`).join(" / ")}`);
  }
  lines.push(`学生填写：${clip(response, 200)}`);
  if (check.answer) {
    lines.push(`参考答案：${clip(check.answer, 120)}（学生可能换了说法，按语义判断，不要做字面比对）`);
  }
  lines.push(positionLine(context));
  return { chip, event: lines.join("\n") };
}
