import type { SubjectId } from "./types";
import type { TutorQuizDraft } from "./prompts";
import type { TutorQuizInput } from "./queries";

const SUBJECTS = new Set<SubjectId>(["math2", "english2", "politics", "cs408"]);
const KEYS = new Set(["A", "B", "C", "D"]);

function text(value: unknown, max: number): string {
  return String(value ?? "").replace(/\r/g, "").trim().slice(0, max);
}

function normalizeSubject(value: unknown): SubjectId | null {
  return SUBJECTS.has(value as SubjectId) ? value as SubjectId : null;
}

/**
 * Enforce the tutor's "one small step" output budget even if the model ignores
 * the prompt. Prefer cutting at a sentence boundary.
 */
export function limitTutorReply(reply: string): string {
  const clean = reply.trim();
  if (clean.length <= 700) return clean;
  const window = clean.slice(0, 700);
  const punctuation = Math.max(
    window.lastIndexOf("。"), window.lastIndexOf("？"), window.lastIndexOf("！"),
    window.lastIndexOf("\n"), window.lastIndexOf("；")
  );
  const cut = punctuation > 280 ? window.slice(0, punctuation + 1) : window;
  return `${cut.trim()}\n\n我们先停在这一步。你觉得哪里还需要展开？`;
}

export function normalizeTutorQuiz(raw: TutorQuizDraft | null | undefined): TutorQuizInput | null {
  if (!raw || typeof raw !== "object") return null;
  const subject = normalizeSubject(raw.subject);
  const stem = text(raw.stem, 500);
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const options = rawOptions
    .slice(0, 4)
    .map((o: any) => ({ key: text(o?.key, 1).toUpperCase(), text: text(o?.text, 240) }))
    .filter(o => KEYS.has(o.key) && o.text);
  const answer = text(raw.answer, 1).toUpperCase();
  if (!subject || stem.length < 5 || options.length !== 4 || !KEYS.has(answer)) return null;
  if (new Set(options.map(o => o.key)).size !== 4) return null;
  if (!options.some(o => o.key === answer)) return null;
  const difficulty = ["基础", "提高", "冲刺"].includes(String(raw.difficulty))
    ? String(raw.difficulty) as "基础" | "提高" | "冲刺"
    : "提高";
  return {
    subject,
    chapter: text(raw.chapter, 80),
    topic: text(raw.topic, 80) || "答疑巩固",
    difficulty,
    stem,
    options,
    answer,
    explanation: text(raw.explanation, 600),
  };
}
