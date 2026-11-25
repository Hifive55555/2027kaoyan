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
  const stripped = reply.replace(/\[\[(?:CHECK|ROADMAP|QUIZ)\]\][\s\S]*?(?:\[\[\/(?:CHECK|ROADMAP)\]\]|$)/gi, "").trim();
  const clean = stripped || reply.trim();
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

export interface TutorCheckDraft {
  kind: "yesno" | "fill";
  prompt: string;
  options?: string[];
  answer?: string;
  placeholder?: string;
}

export function normalizeTutorCheck(raw: TutorCheckDraft | null | undefined): TutorCheckDraft | null {
  if (!raw || typeof raw !== "object") return null;
  const kind = raw.kind === "fill" ? "fill" : "yesno";
  const prompt = text(raw.prompt, 240);
  if (prompt.length < 3) return null;
  if (kind === "fill") {
    return {
      kind,
      prompt,
      placeholder: text(raw.placeholder, 60) || "填写你的答案",
      answer: text(raw.answer, 120),
    };
  }
  const options = (Array.isArray(raw.options) ? raw.options : [])
    .map(o => text(o, 20))
    .filter(Boolean)
    .slice(0, 4);
  return {
    kind,
    prompt,
    options: options.length >= 2 ? options : ["会了", "还不会", "不确定"],
  };
}

function takeTaggedBlock(text: string, tag: "CHECK" | "ROADMAP"): { body: string; text: string } | null {
  const open = new RegExp(`\\[\\[${tag}\\]\\]`, "i");
  const match = open.exec(text);
  if (!match) return null;
  const start = match.index;
  const bodyStart = start + match[0].length;
  const closeRe = new RegExp(`\\[\\[/${tag}\\]\\]`, "i");
  const close = closeRe.exec(text.slice(bodyStart));
  let end = text.length;
  let bodyEnd = text.length;
  if (close) {
    bodyEnd = bodyStart + close.index;
    end = bodyEnd + close[0].length;
  } else {
    // Models occasionally omit the closing tag. Find the balanced JSON
    // object so the learner never sees the raw control block.
    const first = text.indexOf("{", bodyStart);
    if (first >= 0) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = first; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
          if (escaped) escaped = false;
          else if (ch === "\\") escaped = true;
          else if (ch === '"') inString = false;
          continue;
        }
        if (ch === '"') { inString = true; continue; }
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) { bodyEnd = i + 1; end = bodyEnd; break; }
        }
      }
    }
  }
  return {
    body: text.slice(bodyStart, bodyEnd).trim(),
    text: (text.slice(0, start) + text.slice(end)).replace(/\n{3,}/g, "\n\n").trim(),
  };
}

export function extractTutorCheck(text: string): { text: string; check: TutorCheckDraft | null } {
  const block = takeTaggedBlock(text, "CHECK");
  if (!block) return { text, check: null };
  let check: TutorCheckDraft | null = null;
  try {
    check = normalizeTutorCheck(JSON.parse(block.body));
  } catch {
    check = null;
  }
  return { text: block.text, check };
}

export interface TutorRoadmapDraft {
  add?: { title: string; parentId?: string | null; status?: "pending" | "in_progress" | "done" }[];
  update?: { id: string; status: "pending" | "in_progress" | "done" }[];
}

export function extractTutorRoadmap(text: string): { text: string; ops: TutorRoadmapDraft | null } {
  const block = takeTaggedBlock(text, "ROADMAP");
  if (!block) return { text, ops: null };
  let ops: TutorRoadmapDraft | null = null;
  try {
    const raw = JSON.parse(block.body);
    const add = Array.isArray(raw?.add)
      ? raw.add.map((x: any) => ({ title: textOf(x?.title, 100), parentId: x?.parentId ? textOf(x.parentId, 40) : null, status: ["pending", "in_progress", "done"].includes(x?.status) ? x.status : undefined })).filter((x: any) => x.title.length >= 2)
      : [];
    const update = Array.isArray(raw?.update)
      ? raw.update
          .map((x: any) => ({ id: textOf(x?.id, 40), status: x?.status }))
          .filter((x: any) => x.id && ["pending", "in_progress", "done"].includes(x.status))
      : [];
    ops = { add, update } as TutorRoadmapDraft;
  } catch {
    ops = null;
  }
  return { text: block.text, ops };
}

function textOf(value: unknown, max: number): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}
