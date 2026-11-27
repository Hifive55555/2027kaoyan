import { createHash, randomBytes } from "node:crypto";
import { getDb, newId, nowIso } from "./db";
import type {
  AttemptPublic,
  ChatMessage,
  GradeFeedback,
  PaperPublic,
  QuestionPublic,
  SectionPublic,
  SubjectId,
  TutorCheckPublic,
  TutorConversationPublic,
  TutorMessage,
  TutorQuizPublic,
  TutorRoadmapItem,
  TutorSource,
} from "./types";

type Row = Record<string, any>;

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/** Stored as {"list":[...],"uncited":n} in tutor_messages.sources. */
function parseTutorCitations(raw: string | null | undefined): { sources: TutorSource[]; uncited: number } | null {
  if (!raw) return null;
  const data = parseJson<{ list?: TutorSource[]; uncited?: number } | null>(raw, null);
  if (!data || !Array.isArray(data.list) || !data.list.length) return null;
  return { sources: data.list, uncited: Number(data.uncited) || 0 };
}

export interface GeneratedSection {
  label: string;
  material: string;
  questions: GeneratedQuestion[];
}

export interface GeneratedQuestion {
  type: string;
  chapter: string;
  topic: string;
  stem: string;
  options: { key: string; text: string }[];
  answer: string;
  explanation: string;
  score: number;
  difficulty: string;
  rubric: string[];
  sourceNote?: string;
}

export function createPaper(input: {
  userId: string;
  subject: SubjectId;
  chapter: string;
  chapterIds: string[];
  mode: string;
  title: string;
  durationMin: number;
  sections: GeneratedSection[];
  blueprint?: unknown;
}): string {
  const db = getDb();
  const paperId = newId("p");
  const now = nowIso();
  db.prepare(
    `INSERT INTO papers (id, user_id, subject, chapter, mode, title, duration_min, blueprint, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    paperId,
    input.userId,
    input.subject,
    input.chapter,
    input.mode,
    input.title,
    input.durationMin,
    JSON.stringify({ ...(input.blueprint as object || {}), chapterIds: input.chapterIds }),
    now
  );
  let qidx = 0;
  input.sections.forEach((section, sidx) => {
    const sectionId = newId("s");
    db.prepare(
      `INSERT INTO sections (id, paper_id, idx, label, material) VALUES (?, ?, ?, ?, ?)`
    ).run(sectionId, paperId, sidx, section.label || "", section.material || "");
    for (const q of section.questions) {
      const qid = newId("q");
      db.prepare(
        `INSERT INTO questions
         (id, paper_id, section_id, idx, type, stem, options, answer, explanation, rubric, score, difficulty, topic, chapter, source_note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        qid,
        paperId,
        sectionId,
        qidx++,
        q.type,
        q.stem,
        JSON.stringify(q.options || []),
        JSON.stringify(q.answer ?? ""),
        q.explanation || "",
        JSON.stringify(q.rubric || []),
        Number(q.score) || 0,
        q.difficulty || "提高",
        q.topic || "",
        q.chapter || "",
        q.sourceNote || "AI 原创题",
        now
      );
    }
  });
  return paperId;
}

export function getPaper(paperId: string, options: { revealAll?: boolean; userId: string }): PaperPublic | null {
  const db = getDb();
  const paper = db.prepare(`SELECT * FROM papers WHERE id = ? AND user_id = ?`).get(paperId, options.userId) as Row | undefined;
  if (!paper) return null;
  const sections = db.prepare(`SELECT * FROM sections WHERE paper_id = ? ORDER BY idx`).all(paperId) as Row[];
  const questions = db.prepare(`SELECT * FROM questions WHERE paper_id = ? ORDER BY idx`).all(paperId) as Row[];
  const attempts = db.prepare(`SELECT * FROM attempts WHERE paper_id = ? ORDER BY created_at`).all(paperId) as Row[];
  const latestAttempt = new Map<string, Row>();
  for (const a of attempts) latestAttempt.set(a.question_id, a);

  const pubQuestions: QuestionPublic[] = [];
  const map = new Map<string, QuestionPublic>();
  for (const q of questions) {
    const attempt = latestAttempt.get(q.id);
    const revealed = options.revealAll || !!attempt;
    const pub: QuestionPublic = {
      id: q.id,
      paperId: q.paper_id,
      sectionId: q.section_id,
      number: q.idx + 1,
      type: q.type,
      stem: q.stem,
      options: parseJson(q.options, []),
      score: q.score,
      difficulty: q.difficulty,
      topic: q.topic,
      chapter: q.chapter,
      sourceNote: q.source_note,
      attempt: attempt ? toAttempt(attempt) : null,
      revealed,
      reveal: revealed ? { answer: parseJson(q.answer, ""), explanation: q.explanation || "" } : undefined,
    };
    pubQuestions.push(pub);
    map.set(pub.id, pub);
  }

  const blueprint = parseJson<{ chapterIds?: string[] }>(paper.blueprint, {});
  const pubSections: SectionPublic[] = sections.map(s => ({
    id: s.id,
    label: s.label,
    material: s.material,
    questionIds: questions.filter(q => q.section_id === s.id).map(q => q.id),
  }));

  return {
    id: paper.id,
    subject: paper.subject,
    chapter: paper.chapter,
    chapterIds: blueprint.chapterIds || [],
    mode: paper.mode,
    title: paper.title,
    durationMin: paper.duration_min,
    createdAt: paper.created_at,
    sections: pubSections,
    questions: pubQuestions,
    totalScore: pubQuestions.reduce((s, q) => s + q.score, 0),
  };
}

function toAttempt(a: Row): AttemptPublic {
  return {
    id: a.id,
    questionId: a.question_id,
    answer: a.answer || "",
    imagePath: a.image_path || null,
    score: a.score,
    maxScore: a.max_score,
    verdict: a.verdict,
    feedback: parseJson<GradeFeedback>(a.feedback, {}),
    skipped: !!a.skipped,
    createdAt: a.created_at,
  };
}

export function getQuestion(id: string): (QuestionPublic & { paperSubject: SubjectId; paperMode: string; paperUserId: string; answerRaw: string; explanation: string; rubric: string[] }) | null {
  const db = getDb();
  const row = db.prepare(
    `SELECT q.*, p.subject AS paper_subject, p.mode AS paper_mode, p.user_id AS paper_user_id
     FROM questions q JOIN papers p ON p.id = q.paper_id WHERE q.id = ?`
  ).get(id) as Row | undefined;
  if (!row) return null;
  return {
    id: row.id,
    paperId: row.paper_id,
    sectionId: row.section_id,
    number: row.idx + 1,
    type: row.type,
    stem: row.stem,
    options: parseJson(row.options, []),
    score: row.score,
    difficulty: row.difficulty,
    topic: row.topic,
    chapter: row.chapter,
    sourceNote: row.source_note,
    revealed: false,
    paperSubject: row.paper_subject,
    paperMode: row.paper_mode,
    paperUserId: row.paper_user_id,
    answerRaw: parseJson(row.answer, ""),
    explanation: row.explanation,
    rubric: parseJson(row.rubric, []),
  };
}

export function getQuestionAnswer(id: string): { answer: string; explanation: string } | null {
  const db = getDb();
  const row = db.prepare(`SELECT answer, explanation FROM questions WHERE id = ?`).get(id) as Row | undefined;
  if (!row) return null;
  return { answer: parseJson(row.answer, ""), explanation: row.explanation || "" };
}

export function getLatestAttempt(questionId: string): AttemptPublic | null {
  const db = getDb();
  const row = db.prepare(
    `SELECT * FROM attempts WHERE question_id = ? ORDER BY created_at DESC LIMIT 1`
  ).get(questionId) as Row | undefined;
  return row ? toAttempt(row) : null;
}

export function getAttempts(paperId: string): AttemptPublic[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM attempts WHERE paper_id = ? ORDER BY created_at`).all(paperId) as Row[];
  return rows.map(toAttempt);
}

export function saveAttempt(input: {
  userId: string;
  questionId: string;
  paperId: string;
  answer: string;
  imagePath?: string | null;
  score: number | null;
  maxScore: number | null;
  verdict: string | null;
  feedback: GradeFeedback;
  skipped?: boolean;
}): AttemptPublic {
  const db = getDb();
  const id = newId("a");
  const now = nowIso();
  db.prepare(
    `INSERT INTO attempts (id, user_id, paper_id, question_id, answer, image_path, score, max_score, verdict, feedback, skipped, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.userId,
    input.paperId,
    input.questionId,
    input.answer,
    input.imagePath || null,
    input.score,
    input.maxScore,
    input.verdict,
    JSON.stringify(input.feedback || {}),
    input.skipped ? 1 : 0,
    now
  );
  return {
    id,
    questionId: input.questionId,
    answer: input.answer,
    imagePath: input.imagePath || null,
    score: input.score,
    maxScore: input.maxScore,
    verdict: input.verdict as AttemptPublic["verdict"],
    feedback: input.feedback || {},
    skipped: !!input.skipped,
    createdAt: now,
  };
}

export function getMessages(questionId: string): ChatMessage[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM messages WHERE question_id = ? ORDER BY created_at`).all(questionId) as Row[];
  return rows.map(r => ({ id: r.id, role: r.role, content: r.content, createdAt: r.created_at }));
}

export function saveMessage(questionId: string, paperId: string, role: "user" | "assistant", content: string, userId?: string) {
  const db = getDb();
  db.prepare(
    `INSERT INTO messages (id, user_id, question_id, paper_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(newId("m"), userId || null, questionId, paperId, role, content, nowIso());
}

export interface HistoryItem {
  id: string;
  subject: SubjectId;
  title: string;
  chapter: string;
  mode: string;
  createdAt: string;
  total: number;
  answered: number;
  correct: number;
  score: number;
  maxScore: number;
  paperScore: number;
}

export function getHistory(userId: string, limit = 50): HistoryItem[] {
  const db = getDb();
  const papers = db.prepare(`SELECT * FROM papers WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`).all(userId, limit) as Row[];
  const out: HistoryItem[] = [];
  for (const p of papers) {
    const qs = db.prepare(`SELECT id, score FROM questions WHERE paper_id = ?`).all(p.id) as Row[];
    const attempts = db.prepare(
      `SELECT question_id, score, max_score, verdict, skipped, created_at FROM attempts WHERE paper_id = ? ORDER BY created_at`
    ).all(p.id) as Row[];
    const latest = new Map<string, Row>();
    for (const a of attempts) latest.set(a.question_id, a);
    const answered = [...latest.values()].filter(a => !a.skipped);
    const correct = answered.filter(a => a.verdict === "correct").length;
    const score = answered.reduce((s, a) => s + (Number(a.score) || 0), 0);
    const maxScore = [...latest.values()].reduce((s, a) => s + (Number(a.max_score) || 0), 0);
    const paperScore = qs.reduce((s, x) => s + (Number(x.score) || 0), 0);
    out.push({
      id: p.id,
      subject: p.subject,
      title: p.title,
      chapter: p.chapter,
      mode: p.mode,
      createdAt: p.created_at,
      total: qs.length,
      answered: answered.length,
      correct,
      score,
      maxScore,
      paperScore,
    });
  }
  return out;
}

export function getLatestPaper(userId: string): HistoryItem | null {
  const list = getHistory(userId, 10);
  return list.find(h => h.answered < h.total) || list[0] || null;
}

export interface Stats {
  todayCount: number;
  totalAttempts: number;
  accuracy: number;
  streak: number;
  mistakes: number;
  subjectStats: Record<string, { attempts: number; correct: number }>;
  recentDays: { date: string; count: number }[];
}

function localDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function getStats(userId: string): Stats {
  const db = getDb();
  const rows = db.prepare(
    `SELECT a.*, p.subject AS q_subject FROM attempts a JOIN questions q ON q.id = a.question_id JOIN papers p ON p.id = q.paper_id
     WHERE a.skipped = 0 AND p.user_id = ? ORDER BY a.created_at DESC`
  ).all(userId) as Row[];
  const today = localDate(new Date());
  const todayCount = rows.filter(r => localDate(new Date(r.created_at)) === today).length;
  const correct = rows.filter(r => r.verdict === "correct").length;
  const days = [...new Set(rows.map(r => localDate(new Date(r.created_at))))].sort().reverse();
  let streak = 0;
  let cursor = new Date();
  // allow today or yesterday as streak start
  if (!days.includes(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.includes(localDate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const subjectStats: Record<string, { attempts: number; correct: number }> = {};
  for (const r of rows) {
    const s = r.q_subject;
    if (!subjectStats[s]) subjectStats[s] = { attempts: 0, correct: 0 };
    subjectStats[s].attempts++;
    if (r.verdict === "correct") subjectStats[s].correct++;
  }
  const recentDays: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = localDate(d);
    recentDays.push({ date: key, count: rows.filter(r => localDate(new Date(r.created_at)) === key).length });
  }
  const mistakes = db.prepare(
    `SELECT COUNT(*) AS n FROM attempts a JOIN papers p ON p.id = a.paper_id
     WHERE p.user_id = ? AND a.skipped = 0 AND a.verdict IN ('wrong','partial')
       AND a.id = (SELECT a2.id FROM attempts a2 WHERE a2.question_id = a.question_id ORDER BY a2.created_at DESC LIMIT 1)`
  ).get(userId) as Row;
  return {
    todayCount,
    totalAttempts: rows.length,
    accuracy: rows.length ? Math.round((correct / rows.length) * 100) : 0,
    streak,
    mistakes: mistakes.n || 0,
    subjectStats,
    recentDays,
  };
}

export function getWeakChapters(userId: string, subject: string, limit = 3): string[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT q.chapter, COUNT(*) AS n FROM attempts a JOIN questions q ON q.id = a.question_id JOIN papers p ON p.id = q.paper_id
     WHERE p.user_id = ? AND a.skipped = 0 AND a.verdict IN ('wrong','partial') AND p.subject = ?
     GROUP BY q.chapter ORDER BY n DESC LIMIT ?`
  ).all(userId, subject, limit) as Row[];
  return rows.map(r => r.chapter);
}

export function getRecentStems(userId: string, subject: string, limit = 12): string[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT q.stem FROM questions q JOIN papers p ON p.id = q.paper_id
     WHERE p.user_id = ? AND p.subject = ? AND q.type != 'reading'
     ORDER BY q.created_at DESC LIMIT ?`
  ).all(userId, subject, limit * 3) as Row[];
  return rows
    .filter(r => r.stem)
    .slice(0, limit)
    .map(r => String(r.stem).replace(/\s+/g, " ").slice(0, 100));
}

export function saveUpload(userId: string, fileName: string) {
  getDb().prepare(`INSERT OR REPLACE INTO uploads (id, user_id, file_name, created_at) VALUES (?, ?, ?, ?)`)
    .run(newId("up"), userId, fileName, nowIso());
}

export function getUploadOwner(fileName: string): string | null {
  const row = getDb().prepare(`SELECT user_id FROM uploads WHERE file_name = ?`).get(fileName) as Row | undefined;
  return row?.user_id || null;
}

export const UPLOAD_TICKET_TTL_MS = 10 * 60 * 1000;

function hashUploadToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface UploadTicketState {
  status: "pending" | "uploaded" | "expired";
  questionId: string;
  expiresAt: string;
  imagePath?: string;
}

function uploadTicketState(row: Row): UploadTicketState {
  const status = row.status === "uploaded"
    ? "uploaded"
    : row.expires_at > nowIso() ? "pending" : "expired";
  return {
    status,
    questionId: row.question_id,
    expiresAt: row.expires_at,
    imagePath: row.file_name ? `/api/uploads/${row.file_name}` : undefined,
  };
}

export function createUploadTicket(userId: string, questionId: string): { token: string; expiresAt: string } {
  const db = getDb();
  const now = nowIso();
  const expiresAt = new Date(Date.now() + UPLOAD_TICKET_TTL_MS).toISOString();
  db.prepare(`DELETE FROM upload_tickets WHERE expires_at < ?`).run(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  db.prepare(`DELETE FROM upload_tickets WHERE user_id = ? AND question_id = ? AND status = 'pending'`).run(userId, questionId);
  const token = randomBytes(16).toString("hex");
  db.prepare(
    `INSERT INTO upload_tickets (id, token_hash, user_id, question_id, status, created_at, expires_at)
     VALUES (?, ?, ?, ?, 'pending', ?, ?)`
  ).run(newId("ut"), hashUploadToken(token), userId, questionId, now, expiresAt);
  return { token, expiresAt };
}

export function getUploadTicketState(token: string, userId: string): UploadTicketState | null {
  const row = getDb().prepare(`SELECT * FROM upload_tickets WHERE token_hash = ? AND user_id = ?`).get(hashUploadToken(token), userId) as Row | undefined;
  return row ? uploadTicketState(row) : null;
}

export function getUploadTicketPublic(token: string): UploadTicketState | null {
  const row = getDb().prepare(`SELECT * FROM upload_tickets WHERE token_hash = ?`).get(hashUploadToken(token)) as Row | undefined;
  return row ? uploadTicketState(row) : null;
}

export function getUploadTicketUser(token: string): string | null {
  const row = getDb().prepare(`SELECT user_id FROM upload_tickets WHERE token_hash = ?`).get(hashUploadToken(token)) as Row | undefined;
  return row?.user_id || null;
}

export function completeUploadTicket(token: string, fileName: string): boolean {
  const result = getDb().prepare(
    `UPDATE upload_tickets SET status = 'uploaded', file_name = ?
     WHERE token_hash = ? AND status = 'pending' AND expires_at > ?`
  ).run(fileName, hashUploadToken(token), nowIso());
  return Number(result.changes) > 0;
}

export function getPaperAnswers(paperId: string): Record<string, { answer: string; explanation: string }> {
  const db = getDb();
  const rows = db.prepare(`SELECT id, answer, explanation FROM questions WHERE paper_id = ?`).all(paperId) as Row[];
  const out: Record<string, { answer: string; explanation: string }> = {};
  for (const r of rows) out[r.id] = { answer: parseJson(r.answer, ""), explanation: r.explanation || "" };
  return out;
}

export function deletePaper(paperId: string) {
  const db = getDb();
  db.prepare(`DELETE FROM papers WHERE id = ?`).run(paperId);
}

export function appendSection(paperId: string, section: GeneratedSection): string[] {
  const db = getDb();
  const maxSection = db.prepare(`SELECT COALESCE(MAX(idx), -1) AS n FROM sections WHERE paper_id = ?`).get(paperId) as Row;
  const maxQ = db.prepare(`SELECT COALESCE(MAX(idx), -1) AS n FROM questions WHERE paper_id = ?`).get(paperId) as Row;
  const sectionId = newId("s");
  db.prepare(`INSERT INTO sections (id, paper_id, idx, label, material) VALUES (?, ?, ?, ?, ?)`)
    .run(sectionId, paperId, Number(maxSection.n) + 1, section.label || "", section.material || "");
  let idx = Number(maxQ.n) + 1;
  const ids: string[] = [];
  const now = nowIso();
  for (const q of section.questions) {
    const qid = newId("q");
    ids.push(qid);
    db.prepare(
      `INSERT INTO questions
       (id, paper_id, section_id, idx, type, stem, options, answer, explanation, rubric, score, difficulty, topic, chapter, source_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      qid, paperId, sectionId, idx++, q.type, q.stem,
      JSON.stringify(q.options || []), JSON.stringify(q.answer ?? ""), q.explanation || "",
      JSON.stringify(q.rubric || []), Number(q.score) || 0, q.difficulty || "提高",
      q.topic || "", q.chapter || "", q.sourceNote || "AI 同类题", now
    );
  }
  return ids;
}

export interface MistakeItem {
  questionId: string;
  paperId: string;
  subject: SubjectId;
  paperTitle: string;
  chapter: string;
  topic: string;
  type: string;
  stem: string;
  answer: string;
  score: number | null;
  maxScore: number | null;
  verdict: string | null;
  createdAt: string;
  feedback: GradeFeedback;
}

export function getMistakes(userId: string, limit = 60): MistakeItem[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT a.*, q.stem, q.chapter, q.topic, q.type, p.subject, q.paper_id, p.title AS paper_title
     FROM attempts a JOIN questions q ON q.id = a.question_id JOIN papers p ON p.id = q.paper_id
     WHERE p.user_id = ? AND a.skipped = 0 AND a.verdict IN ('wrong','partial')
       AND a.id = (SELECT a2.id FROM attempts a2 WHERE a2.question_id = q.id ORDER BY a2.created_at DESC LIMIT 1)
     ORDER BY a.created_at DESC LIMIT 300`
  ).all(userId) as Row[];
  const seen = new Set<string>();
  const out: MistakeItem[] = [];
  for (const r of rows) {
    if (seen.has(r.question_id)) continue;
    seen.add(r.question_id);
    out.push({
      questionId: r.question_id,
      paperId: r.paper_id,
      subject: r.subject,
      paperTitle: r.paper_title,
      chapter: r.chapter,
      topic: r.topic,
      type: r.type,
      stem: r.stem,
      answer: r.answer,
      score: r.score,
      maxScore: r.max_score,
      verdict: r.verdict,
      createdAt: r.created_at,
      feedback: parseJson(r.feedback, {}),
    });
    if (out.length >= limit) break;
  }
  return out;
}


export interface TutorQuizInput {
  subject: SubjectId;
  chapter: string;
  topic: string;
  difficulty: string;
  stem: string;
  options: { key: string; text: string }[];
  answer: string;
  explanation: string;
}

function tutorQuizPublic(row: Row, attempt?: Row): TutorQuizPublic {
  const base: TutorQuizPublic = {
    id: row.id,
    subject: row.subject,
    chapter: row.chapter || "",
    topic: row.topic || "",
    difficulty: row.difficulty || "提高",
    stem: row.stem,
    options: parseJson(row.options, []),
  };
  if (!attempt) return base;
  return {
    ...base,
    answer: parseJson(row.answer, ""),
    explanation: row.explanation || "",
    attempt: {
      answer: attempt.answer || "",
      correct: !!attempt.correct,
      createdAt: attempt.created_at,
    },
  };
}

export function createTutorQuiz(userId: string, input: TutorQuizInput): string {
  const id = newId("tq");
  getDb().prepare(
    `INSERT INTO tutor_quizzes (id, user_id, subject, chapter, topic, difficulty, stem, options, answer, explanation, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, userId, input.subject, input.chapter || "", input.topic || "", input.difficulty || "提高",
    input.stem, JSON.stringify(input.options), JSON.stringify(input.answer),
    input.explanation || "", nowIso()
  );
  return id;
}

export function getTutorQuiz(id: string, userId: string): TutorQuizPublic | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM tutor_quizzes WHERE id = ? AND user_id = ?`).get(id, userId) as Row | undefined;
  if (!row) return null;
  const attempt = db.prepare(`SELECT * FROM tutor_quiz_attempts WHERE quiz_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`).get(id, userId) as Row | undefined;
  return tutorQuizPublic(row, attempt);
}

export function getTutorQuizRaw(id: string, userId: string): (TutorQuizPublic & { answer: string; explanation: string; }) | null {
  const quiz = getTutorQuiz(id, userId);
  if (!quiz) return null;
  const row = getDb().prepare(`SELECT answer, explanation FROM tutor_quizzes WHERE id = ? AND user_id = ?`).get(id, userId) as Row | undefined;
  if (!row) return null;
  return { ...quiz, answer: parseJson(row.answer, ""), explanation: row.explanation || "" };
}

export function saveTutorMessage(
  userId: string,
  conversationId: string,
  role: "user" | "assistant" | "system" | "tool",
  content: string,
  quizId?: string,
  checkId?: string,
  extras: { toolCalls?: unknown; toolCallId?: string; toolName?: string; citations?: unknown } = {},
): TutorMessage {
  const id = newId("tm");
  const createdAt = nowIso();
  const toolCalls = extras.toolCalls ? JSON.stringify(extras.toolCalls) : null;
  const citations = extras.citations ? JSON.stringify(extras.citations) : null;
  getDb().prepare(
    `INSERT INTO tutor_messages (id, user_id, conversation_id, role, content, quiz_id, check_id, tool_calls, tool_call_id, tool_name, sources, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, userId, conversationId, role, content, quizId || null, checkId || null, toolCalls, extras.toolCallId || null, extras.toolName || null, citations, createdAt);
  getDb().prepare(`UPDATE tutor_conversations SET updated_at = ? WHERE id = ? AND user_id = ?`)
    .run(createdAt, conversationId, userId);
  return {
    id, role, content, createdAt,
    toolCalls: extras.toolCalls as TutorMessage["toolCalls"],
    toolCallId: extras.toolCallId,
    toolName: extras.toolName,
  };
}



export function deleteTutorMessage(userId: string, id: string) {
  getDb().prepare(`DELETE FROM tutor_messages WHERE id = ? AND user_id = ?`).run(id, userId);
}

export function getTutorMessages(userId: string, conversationId: string, limit?: number): TutorMessage[] {
  const db = getDb();
  const rows = (limit
    ? db.prepare(`SELECT * FROM tutor_messages WHERE user_id = ? AND conversation_id = ? AND role != 'tool' ORDER BY created_at DESC LIMIT ?`).all(userId, conversationId, limit)
    : db.prepare(`SELECT * FROM tutor_messages WHERE user_id = ? AND conversation_id = ? AND role != 'tool' ORDER BY created_at DESC`).all(userId, conversationId)) as Row[];
  return rows.reverse().filter(row => !(row.role === "assistant" && row.tool_calls && !row.content)).map(row => {
    const citations = parseTutorCitations(row.sources);
    return {
      id: row.id,
      role: row.role === "assistant" ? "assistant" as const : row.role === "system" ? "system" as const : "user" as const,
      content: row.content,
      createdAt: row.created_at,
      quiz: row.quiz_id ? getTutorQuiz(row.quiz_id, userId) || undefined : undefined,
      check: row.check_id ? getTutorCheck(row.check_id, userId) || undefined : undefined,
      sources: citations?.sources,
      uncitedSources: citations?.uncited,
    };
  });
}

export function getTutorHistory(userId: string, conversationId: string, excludeId?: string): TutorMessage[] {
  const rows = getDb().prepare(
    `SELECT * FROM tutor_messages WHERE user_id = ? AND conversation_id = ? ${excludeId ? "AND id != ?" : ""} ORDER BY created_at ASC`
  ).all(...(excludeId ? [userId, conversationId, excludeId] : [userId, conversationId])) as Row[];
  return rows.filter(row => row.role !== "system").map(row => ({
    id: row.id,
    role: row.role === "assistant" ? "assistant" as const : row.role === "tool" ? "tool" as const : "user" as const,
    content: row.content,
    createdAt: row.created_at,
    quiz: row.quiz_id ? getTutorQuiz(row.quiz_id, userId) || undefined : undefined,
    check: row.check_id ? getTutorCheck(row.check_id, userId) || undefined : undefined,
    toolCalls: row.tool_calls ? parseJson(row.tool_calls, undefined) : undefined,
    toolCallId: row.tool_call_id || undefined,
    toolName: row.tool_name || undefined,
  }));
}

export function saveTutorQuizAttempt(userId: string, quizId: string, answer: string, correct: boolean) {
  getDb().prepare(
    `INSERT INTO tutor_quiz_attempts (id, user_id, quiz_id, answer, correct, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(newId("ta"), userId, quizId, answer, correct ? 1 : 0, nowIso());
}

export function getTutorGoal(userId: string): string {
  const row = getDb().prepare(`SELECT content FROM learner_notes WHERE user_id = ? AND kind = 'goal'`).get(userId) as Row | undefined;
  return row?.content || "";
}

export function setTutorGoal(userId: string, content: string) {
  getDb().prepare(
    `INSERT INTO learner_notes (id, user_id, kind, content, updated_at) VALUES (?, ?, 'goal', ?, ?)
     ON CONFLICT(user_id, kind) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
  ).run(newId("ln"), userId, content.trim().slice(0, 500), nowIso());
}

export function resetTutorMessages(userId: string) {
  getDb().prepare(`DELETE FROM tutor_messages WHERE user_id = ?`).run(userId);
}


export interface RandomChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export function getRandomMessages(userId: string, questionId: string): RandomChatMessage[] {
  const rows = getDb().prepare(
    `SELECT * FROM random_messages WHERE user_id = ? AND question_id = ? ORDER BY created_at ASC LIMIT 80`
  ).all(userId, questionId) as Row[];
  return rows.map(row => ({
    id: row.id,
    role: row.role === "assistant" ? "assistant" as const : "user" as const,
    content: row.content,
    createdAt: row.created_at,
  }));
}

export function saveRandomMessage(userId: string, questionId: string, role: "user" | "assistant", content: string) {
  getDb().prepare(
    `INSERT INTO random_messages (id, user_id, question_id, role, content, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(newId("rm"), userId, questionId, role, content, nowIso());
}


export interface TutorCheckInput {
  kind: "yesno" | "fill";
  prompt: string;
  options?: string[];
  answer?: string;
  placeholder?: string;
}

function tutorCheckPublic(row: Row, attempt?: Row): TutorCheckPublic {
  const base: TutorCheckPublic = {
    id: row.id,
    kind: row.kind === "fill" ? "fill" : "yesno",
    prompt: row.prompt,
    options: parseJson(row.options, []),
    placeholder: row.placeholder || "",
  };
  if (!attempt) return base;
  return {
    ...base,
    attempt: {
      response: attempt.response || "",
      correct: attempt.correct === null || attempt.correct === undefined ? null : !!attempt.correct,
      createdAt: attempt.created_at,
    },
  };
}

export function createTutorCheck(userId: string, input: TutorCheckInput): string {
  const id = newId("tc");
  const kind = input.kind === "fill" ? "fill" : "yesno";
  const options = kind === "yesno"
    ? (input.options?.length ? input.options.slice(0, 4) : ["会了", "还不会", "不确定"])
    : [];
  getDb().prepare(
    `INSERT INTO tutor_checks (id, user_id, kind, prompt, options, answer, placeholder, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, userId, kind, input.prompt, JSON.stringify(options),
    input.answer || "", input.placeholder || "", nowIso()
  );
  return id;
}

export function getTutorCheck(id: string, userId: string): TutorCheckPublic | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM tutor_checks WHERE id = ? AND user_id = ?`).get(id, userId) as Row | undefined;
  if (!row) return null;
  const attempt = db.prepare(`SELECT * FROM tutor_check_attempts WHERE check_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1`).get(id, userId) as Row | undefined;
  return tutorCheckPublic(row, attempt);
}

export function getTutorCheckRaw(id: string, userId: string): (TutorCheckPublic & { answer: string; }) | null {
  const check = getTutorCheck(id, userId);
  if (!check) return null;
  const row = getDb().prepare(`SELECT answer FROM tutor_checks WHERE id = ? AND user_id = ?`).get(id, userId) as Row | undefined;
  return { ...check, answer: row?.answer || "" };
}

export function saveTutorCheckAttempt(userId: string, checkId: string, response: string, correct: boolean | null) {
  getDb().prepare(
    `INSERT INTO tutor_check_attempts (id, user_id, check_id, response, correct, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(newId("tca"), userId, checkId, response, correct === null ? null : correct ? 1 : 0, nowIso());
}


const ROADMAP_STATUS = new Set(["pending", "in_progress", "done"]);

function toRoadmapItem(row: Row): TutorRoadmapItem {
  return {
    id: row.id,
    parentId: row.parent_id || null,
    title: row.title,
    status: ROADMAP_STATUS.has(row.status) ? row.status : "pending",
    sort: Number(row.sort) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    manual: Number(row.manual) === 1,
  };
}

export function getTutorRoadmap(userId: string, conversationId: string): TutorRoadmapItem[] {
  const rows = getDb().prepare(
    `SELECT * FROM tutor_roadmap WHERE user_id = ? AND conversation_id = ? ORDER BY sort ASC, created_at ASC`
  ).all(userId, conversationId) as Row[];
  return rows.map(toRoadmapItem);
}

function roadmapOrder(items: TutorRoadmapItem[]): TutorRoadmapItem[] {
  const byParent = new Map<string, TutorRoadmapItem[]>();
  const roots: TutorRoadmapItem[] = [];
  for (const item of items) {
    const key = item.parentId || "";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(item);
    if (!item.parentId) roots.push(item);
  }
  const out: TutorRoadmapItem[] = [];
  const walk = (parentId: string, depth: number) => {
    for (const item of byParent.get(parentId) || []) {
      out.push(item);
      walk(item.id, depth + 1);
    }
  };
  walk("", 0);
  // Orphans / cycles: append so they are not silently lost.
  for (const item of items) if (!out.some(x => x.id === item.id)) out.push(item);
  return out;
}

export function getTutorRoadmapText(userId: string, conversationId: string): string {
  const items = getTutorRoadmap(userId, conversationId);
  if (!items.length) return "（暂无学习路线；当开始新主题时，先列出接下来 1–3 个可执行点。）";
  const ordered = roadmapOrder(items);
  const depth = new Map<string, number>();
  for (const item of ordered) depth.set(item.id, item.parentId ? (depth.get(item.parentId) || 0) + 1 : 0);
  const status = { pending: "待学", in_progress: "进行中", done: "已完成" };
  const lines = ordered.slice(0, 40).map(item => {
    const pad = "  ".repeat(depth.get(item.id) || 0);
    const mark = item.manual ? "（学生手动标记，未经验证）" : "";
    return `${pad}- [${status[item.status]}] ${item.title}${mark}  (id: ${item.id})`;
  });
  const current = ordered.find(item => item.status === "in_progress")
    || ordered.find(item => item.status === "pending");
  if (current) {
    lines.push(`当前应推进：[${status[current.status]}] ${current.title}  (id: ${current.id})`);
  } else {
    lines.push("当前路线已全部完成。");
  }
  return lines.join("\n");
}

function roadmapMatchScore(title: string, text: string): number {
  const clean = title
    .replace(/（[^）]*）|\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (!clean) return 0;
  let score = 0;
  if (clean.length >= 3 && text.includes(clean)) score += 12;
  for (const part of clean.split(/[与和、，,/\\|]+/).map(x => x.trim()).filter(x => x.length >= 2)) {
    if (text.includes(part)) score += part.length >= 5 ? 7 : part.length >= 4 ? 6 : part.length === 3 ? 4 : 2;
  }
  for (let n = 4; n >= 2; n--) {
    const seen = new Set<string>();
    for (let i = 0; i + n <= clean.length; i++) {
      const gram = clean.slice(i, i + n).replace(/\s/g, "");
      if (gram.length !== n || seen.has(gram)) continue;
      seen.add(gram);
      if (text.includes(gram)) score += n >= 4 ? 3 : n === 3 ? 2 : 1;
    }
  }
  const alias = title.match(/[（(]([^）)]+)[）)]/)?.[1]?.toLowerCase();
  if (alias && alias.split(/[，,/|\s]+/).some(x => x.length >= 2 && text.includes(x))) score += 6;
  return score;
}

function roadmapMatchPosition(title: string, text: string): { pos: number; len: number } {
  const clean = title
    .replace(/（[^）]*）|\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  let bestPos = -1;
  let bestLen = 0;
  const consider = (part: string) => {
    if (part.length < 2) return;
    const at = text.indexOf(part);
    if (at < 0) return;
    if (part.length > bestLen || (part.length === bestLen && (bestPos < 0 || at < bestPos))) {
      bestPos = at;
      bestLen = part.length;
    }
  };
  if (clean.length >= 3) consider(clean);
  const parts = clean.split(/[与和、，,/\\|]+/).map(x => x.trim()).filter(x => x.length >= 2);
  for (const part of parts) consider(part);
  for (let n = 4; n >= 2; n--) {
    for (let i = 0; i + n <= clean.length; i++) {
      const gram = clean.slice(i, i + n).replace(/\s/g, "");
      if (gram.length === n) consider(gram);
    }
  }
  const alias = title.match(/[（(]([^）)]+)[）)]/)?.[1]?.toLowerCase();
  if (alias) {
    for (const part of alias.split(/[，,/|\s]+/)) consider(part);
  }
  return { pos: bestPos, len: bestLen };
}

/**
 * The model is asked to emit [[ROADMAP]] when it moves to a new topic, but
 * that is probabilistic. This deterministic fallback keeps the visible
 * roadmap moving with the lesson: when the reply clearly discusses a later
 * roadmap item, mark it in progress and close the immediately preceding
 * items. It never moves the roadmap backwards.
 */
export function syncTutorRoadmapForReply(userId: string, conversationId: string, text: string): TutorRoadmapItem[] {
  const items = roadmapOrder(getTutorRoadmap(userId, conversationId));
  if (!items.length) return items;
  const normalized = text.replace(/\s+/g, " ").toLowerCase();
  const inProgressIdx = items.map(i => i.status).lastIndexOf("in_progress");
  const doneIdx = items.map(i => i.status).lastIndexOf("done");
  const start = inProgressIdx >= 0 ? inProgressIdx : Math.min(items.length - 1, doneIdx + 1);
  if (start >= items.length) return items;

  const candidates = items
    .map((item, idx) => {
      const match = roadmapMatchPosition(item.title, normalized);
      return { item, idx, score: roadmapMatchScore(item.title, normalized), pos: match.pos, len: match.len };
    })
    .filter(x => x.idx >= start && x.item.status !== "done" && x.score >= 2 && x.len >= 2)
    .sort((a, b) => b.score - a.score || a.idx - b.idx);
  if (!candidates.length) return items;

  const transitionRe = /(?:就到这里?|就到这|收掉|收尾|学完|结束|完成|进入|开始|接下来|下一步|转入|转到|继续讲|继续学|下面(?:看|学|讲))/g;
  let transitionPos = -1;
  for (const match of normalized.matchAll(transitionRe)) transitionPos = match.index ?? transitionPos;
  const maxLen = Math.max(...candidates.map(x => x.len));
  const strong = candidates.filter(x => x.len === maxLen);
  const afterTransition = strong.filter(x => transitionPos >= 0 && x.pos > transitionPos);

  // A lesson reply often lists several upcoming topics. Prefer the earliest
  // topic unless a later one is clearly the actual focus (a much higher
  // title match), otherwise a four-item outline would skip the roadmap
  // straight to the last item. If the reply explicitly transitions into a
  // topic, ignore topics mentioned before the transition phrase.
  const best = afterTransition.length
    ? afterTransition.sort((a, b) => a.pos - b.pos || a.idx - b.idx)[0]
    : strong.sort((a, b) => a.pos - b.pos || a.idx - b.idx)[0];
  const closesPrevious = /(?:就到这里?|就到这|收掉|收尾|学完|结束|完成)/.test(normalized);
  const updates = new Map<string, "pending" | "in_progress" | "done">();
  for (let i = 0; i < best.idx; i++) {
    const item = items[i];
    if (item.status === "in_progress") updates.set(item.id, "done");
    else if (item.status === "pending" && (closesPrevious || best.idx - start <= 1)) updates.set(item.id, "done");
  }
  if (best.item.status === "pending") updates.set(best.item.id, "in_progress");
  if (!updates.size) return items;

  const db = getDb();
  const now = nowIso();
  for (const [id, status] of updates) {
    db.prepare(
      `UPDATE tutor_roadmap SET status = ?, manual = 0, updated_at = ? WHERE id = ? AND user_id = ?`
    ).run(status, now, id, userId);
  }
  return getTutorRoadmap(userId, conversationId);
}

export interface TutorRoadmapOps {
  add?: { title: string; parentId?: string | null; status?: "pending" | "in_progress" | "done" }[];
  update?: { id: string; status: "pending" | "in_progress" | "done" }[];
}

export function applyTutorRoadmapOps(userId: string, conversationId: string, ops: TutorRoadmapOps): TutorRoadmapItem[] {
  const db = getDb();
  const existing = new Map(getTutorRoadmap(userId, conversationId).map(i => [i.id, i]));
  const maxSortRow = db.prepare(`SELECT COALESCE(MAX(sort), -1) AS n FROM tutor_roadmap WHERE user_id = ? AND conversation_id = ?`).get(userId, conversationId) as Row;
  let nextSort = Number(maxSortRow.n) + 1;
  const now = nowIso();
  const existingTitles = new Set([...existing.values()].map(i => `${i.parentId || ""}|${i.title.toLowerCase()}`));
  const hadInProgress = [...existing.values()].some(i => i.status === "in_progress");
  const addedIds: string[] = [];
  for (const add of (ops.add || []).slice(0, 10)) {
    if (existing.size >= 60) break;
    const title = String(add.title || "").replace(/\s+/g, " ").trim().slice(0, 100);
    if (title.length < 2) continue;
    const parentId = add.parentId && existing.has(add.parentId) ? add.parentId : null;
    const key = `${parentId || ""}|${title.toLowerCase()}`;
    if (existingTitles.has(key)) continue;
    existingTitles.add(key);
    const id = newId("tr");
    const status = add.status && ROADMAP_STATUS.has(add.status) ? add.status : "pending";
    db.prepare(
      `INSERT INTO tutor_roadmap (id, user_id, conversation_id, parent_id, title, status, sort, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, userId, conversationId, parentId, title, status, nextSort++, now, now);
    addedIds.push(id);
    existing.set(id, { id, parentId, title, status, sort: nextSort - 1, createdAt: now, updatedAt: now });
  }
  // A newly added route has no existing id for the model to update. If it
  // did not explicitly mark a current item, make the first new item current.
  if (!hadInProgress && addedIds.length && !addedIds.some(id => existing.get(id)?.status === "in_progress")) {
    const first = addedIds[0];
    db.prepare(`UPDATE tutor_roadmap SET status = 'in_progress', updated_at = ? WHERE id = ? AND user_id = ?`).run(now, first, userId);
  }
  for (const update of (ops.update || []).slice(0, 12)) {
    if (!existing.has(update.id) || !ROADMAP_STATUS.has(update.status)) continue;
    db.prepare(`UPDATE tutor_roadmap SET status = ?, manual = 0, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(update.status, now, update.id, userId);
  }
  return getTutorRoadmap(userId, conversationId);
}

export function setTutorRoadmapStatus(userId: string, id: string, status: "pending" | "in_progress" | "done"): TutorRoadmapItem[] | null {
  if (!ROADMAP_STATUS.has(status)) return null;
  const row = getDb().prepare(`SELECT id, conversation_id FROM tutor_roadmap WHERE id = ? AND user_id = ?`).get(id, userId) as Row | undefined;
  if (!row) return null;
  getDb().prepare(`UPDATE tutor_roadmap SET status = ?, manual = 1, updated_at = ? WHERE id = ? AND user_id = ?`)
    .run(status, nowIso(), id, userId);
  return getTutorRoadmap(userId, row.conversation_id || "");
}


export function getTutorConversation(userId: string, id: string): TutorConversationPublic | null {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM tutor_conversations WHERE id = ? AND user_id = ?`).get(id, userId) as Row | undefined;
  if (!row) return null;
  const visible = `role != 'tool' AND NOT (role = 'assistant' AND tool_calls IS NOT NULL AND content = '')`;
  const stat = db.prepare(`SELECT COUNT(*) AS n, MAX(created_at) AS last_at FROM tutor_messages WHERE conversation_id = ? AND user_id = ? AND ${visible}`).get(id, userId) as Row;
  const last = db.prepare(`SELECT content FROM tutor_messages WHERE conversation_id = ? AND user_id = ? AND ${visible} ORDER BY created_at DESC LIMIT 1`).get(id, userId) as Row | undefined;
  return {
    id: row.id,
    title: row.title || "新的对话",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at || null,
    messageCount: Number(stat?.n) || 0,
    lastMessage: last?.content || "",
    lastMessageAt: stat?.last_at || null,
  };
}

export function createTutorConversation(userId: string, title = "新的对话"): TutorConversationPublic {
  const id = newId("tconv");
  const now = nowIso();
  getDb().prepare(`INSERT INTO tutor_conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, userId, title.slice(0, 60) || "新的对话", now, now);
  return { id, title, createdAt: now, updatedAt: now, archivedAt: null, messageCount: 0, lastMessage: "", lastMessageAt: null };
}

export function getOrCreateActiveTutorConversation(userId: string, requestedId?: string): TutorConversationPublic {
  if (requestedId) {
    const requested = getTutorConversation(userId, requestedId);
    if (requested) return requested;
  }
  const row = getDb().prepare(
    `SELECT * FROM tutor_conversations WHERE user_id = ? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 1`
  ).get(userId) as Row | undefined;
  if (row) return getTutorConversation(userId, row.id)!;
  return createTutorConversation(userId);
}

export function updateTutorConversation(userId: string, id: string, input: { title?: string; archived?: boolean }): TutorConversationPublic | null {
  const conv = getTutorConversation(userId, id);
  if (!conv) return null;
  const db = getDb();
  if (typeof input.title === "string" && input.title.trim()) {
    db.prepare(`UPDATE tutor_conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(input.title.trim().slice(0, 60), nowIso(), id, userId);
  }
  if (typeof input.archived === "boolean") {
    db.prepare(`UPDATE tutor_conversations SET archived_at = ? WHERE id = ? AND user_id = ?`)
      .run(input.archived ? nowIso() : null, id, userId);
  }
  return getTutorConversation(userId, id);
}

export function listTutorConversations(userId: string, archived: boolean, query = ""): TutorConversationPublic[] {
  const db = getDb();
  const q = query.trim();
  const like = `%${q}%`;
  const rows = db.prepare(
    `SELECT c.*,
       (SELECT COUNT(*) FROM tutor_messages m WHERE m.conversation_id = c.id AND m.role != 'tool' AND NOT (m.role = 'assistant' AND m.tool_calls IS NOT NULL AND m.content = '')) AS message_count,
       (SELECT content FROM tutor_messages m WHERE m.conversation_id = c.id AND m.role != 'tool' AND NOT (m.role = 'assistant' AND m.tool_calls IS NOT NULL AND m.content = '') ORDER BY m.created_at DESC LIMIT 1) AS last_message,
       (SELECT MAX(created_at) FROM tutor_messages m WHERE m.conversation_id = c.id AND m.role != 'tool' AND NOT (m.role = 'assistant' AND m.tool_calls IS NOT NULL AND m.content = '')) AS last_message_at
     FROM tutor_conversations c
     WHERE c.user_id = ?
       AND ${archived ? "c.archived_at IS NOT NULL" : "c.archived_at IS NULL"}
       ${q ? `AND (c.title LIKE ? OR EXISTS (SELECT 1 FROM tutor_messages m2 WHERE m2.conversation_id = c.id AND m2.content LIKE ?))` : ""}
     ORDER BY c.updated_at DESC`
  ).all(...(q ? [userId, like, like] : [userId])) as Row[];
  return rows.map(row => ({
    id: row.id,
    title: row.title || "新的对话",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at || null,
    messageCount: Number(row.message_count) || 0,
    lastMessage: row.last_message || "",
    lastMessageAt: row.last_message_at || null,
  }));
}

export function titleTutorConversation(userId: string, id: string, message: string) {
  const row = getDb().prepare(`SELECT title FROM tutor_conversations WHERE id = ? AND user_id = ?`).get(id, userId) as Row | undefined;
  if (!row || row.title !== "新的对话") return;
  const title = String(message || "")
    .replace(/^【系统事件】[^：:]*[：:]\s*/, "")
    .replace(/\s+/g, " ")
    .replace(/[。！？!?]+$/g, "")
    .trim()
    .slice(0, 24);
  if (title) {
    getDb().prepare(`UPDATE tutor_conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
      .run(title, nowIso(), id, userId);
  }
}

// Only replace an auto-generated title. A user-renamed conversation must not
// be overwritten by the delayed title-generation pass.
export function replaceTutorConversationTitle(
  userId: string,
  id: string,
  expectedTitle: string,
  title: string,
): string | null {
  const clean = String(title || "").replace(/\s+/g, " ").trim().slice(0, 24);
  if (!clean) return null;
  const row = getDb().prepare(`SELECT title FROM tutor_conversations WHERE id = ? AND user_id = ?`).get(id, userId) as Row | undefined;
  if (!row || row.title !== expectedTitle) return null;
  getDb().prepare(`UPDATE tutor_conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
    .run(clean, nowIso(), id, userId);
  return clean;
}

export function getTutorConversationForQuiz(userId: string, quizId: string): string | null {
  const row = getDb().prepare(`SELECT conversation_id FROM tutor_messages WHERE quiz_id = ? AND user_id = ? AND conversation_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`).get(quizId, userId) as Row | undefined;
  return row?.conversation_id || null;
}

export function getTutorConversationForCheck(userId: string, checkId: string): string | null {
  const row = getDb().prepare(`SELECT conversation_id FROM tutor_messages WHERE check_id = ? AND user_id = ? AND conversation_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`).get(checkId, userId) as Row | undefined;
  return row?.conversation_id || null;
}
