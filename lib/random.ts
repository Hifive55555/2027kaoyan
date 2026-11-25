import fs from "node:fs";
import path from "node:path";
import { getDb, newId, nowIso } from "./db";
import { SUBJECTS } from "./subjects";
import type { SubjectId } from "./types";

type BankQuestion = {
  id: string;
  subject: SubjectId;
  year: number;
  number: number;
  type: string;
  chapter: string;
  topic?: string;
  difficulty?: string;
  stem: string;
  options: { key: string; text: string }[];
  answer: string;
  explanation?: string;
};

type Pool = { byId: Map<string, BankQuestion>; bySubject: Map<string, BankQuestion[]> };

declare global {
  var __yantuRandomPool: Pool | undefined;
}

function answerLetter(q: BankQuestion): string {
  return String(q.answer || "").toUpperCase().replace(/[^A-D]/g, "").slice(0, 1);
}

function eligible(q: BankQuestion): boolean {
  if (!q.stem || !Array.isArray(q.options) || q.options.length < 2) return false;
  if (!q.options.every(o => String(o.text || "").trim().length > 1 && String(o.text).trim() !== ".")) return false;
  if (!["choice", "single"].includes(q.type)) return false;
  return /^[A-D]$/.test(answerLetter(q));
}

function loadBank(subject: "math2" | "politics" | "cs408" | "english2"): BankQuestion[] {
  const base = subject === "english2" ? "english2-random.json" : `${subject}.json`;
  const files = [base, `${subject}-external.json`];
  const out: BankQuestion[] = [];
  for (const name of files) {
    const file = path.join(process.cwd(), "data/bank", name);
    if (!fs.existsSync(file)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(file, "utf8"));
      out.push(...(data.questions || [])
        .filter(eligible)
        .map((q: BankQuestion) => ({
          ...q,
          subject,
          options: q.options.map(o => ({ key: String(o.key), text: String(o.text) })),
          answer: answerLetter(q),
        })));
    } catch { /* optional bank */ }
  }
  return out;
}

function pool(): Pool {
  if (globalThis.__yantuRandomPool) return globalThis.__yantuRandomPool;
  const all: BankQuestion[] = [
    ...loadBank("math2"),
    ...loadBank("english2"),
    ...loadBank("politics"),
    ...loadBank("cs408"),
  ];
  const byId = new Map(all.map(q => [q.id, q]));
  const bySubject = new Map<string, BankQuestion[]>();
  for (const q of all) {
    if (!bySubject.has(q.subject)) bySubject.set(q.subject, []);
    bySubject.get(q.subject)!.push(q);
  }
  const p = { byId, bySubject };
  globalThis.__yantuRandomPool = p;
  return p;
}

export function randomQuestionPublic(q: BankQuestion) {
  return {
    id: q.id,
    subject: q.subject,
    subjectName: SUBJECTS.find(s => s.id === q.subject)?.short || q.subject,
    year: q.year,
    number: q.number,
    type: q.type,
    chapter: q.chapter,
    topic: q.topic || "",
    difficulty: q.difficulty || "真题",
    stem: q.stem,
    options: q.options,
  };
}

export function pickRandomQuestion(userId: string, excludeId?: string): ReturnType<typeof randomQuestionPublic> | null {
  const p = pool();
  const db = getDb();
  const recent = (db.prepare(
    `SELECT question_id FROM random_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 60`
  ).all(userId) as { question_id: string }[]).map(r => r.question_id);
  const blocked = new Set([...recent, ...(excludeId ? [excludeId] : [])]);

  const subjects = [...p.bySubject.keys()];
  if (!subjects.length) return null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const subject = subjects[Math.floor(Math.random() * subjects.length)];
    const list = p.bySubject.get(subject) || [];
    const available = list.filter(q => !blocked.has(q.id));
    if (available.length) {
      return randomQuestionPublic(available[Math.floor(Math.random() * available.length)]);
    }
  }
  const all = [...p.byId.values()];
  return all.length ? randomQuestionPublic(all[Math.floor(Math.random() * all.length)]) : null;
}

export function gradeRandom(userId: string, questionId: string, rawAnswer: string) {
  const q = pool().byId.get(questionId);
  if (!q) throw new Error("题目不存在");
  const answer = String(rawAnswer || "").toUpperCase().replace(/[^A-Z]/g, "");
  const correct = answer === answerLetter(q);
  const db = getDb();
  db.prepare(
    `INSERT INTO random_attempts (id, user_id, question_id, subject, chapter, answer, correct, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(newId("ra"), userId, q.id, q.subject, q.chapter, answer, correct ? 1 : 0, nowIso());
  return {
    correct,
    answer: answerLetter(q),
    explanation: q.explanation || "",
    topic: q.topic || "",
    chapter: q.chapter,
  };
}

export function getRandomStats(userId: string): { total: number; correct: number; accuracy: number } {
  const db = getDb();
  const row = db.prepare(
    `SELECT COUNT(*) AS total, COALESCE(SUM(correct),0) AS correct FROM random_attempts WHERE user_id = ?`
  ).get(userId) as { total: number; correct: number };
  return {
    total: row.total,
    correct: row.correct,
    accuracy: row.total ? Math.round((row.correct / row.total) * 100) : 0,
  };
}

export interface RandomHistoryItem {
  id: string;
  questionId: string;
  subject: SubjectId;
  chapter: string;
  correct: boolean;
  createdAt: string;
  stem: string;
}

export function getRandomHistory(userId: string, limit = 20): RandomHistoryItem[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT * FROM random_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`
  ).all(userId, limit) as Record<string, any>[];
  const p = pool();
  return rows.map(r => {
    const q = p.byId.get(r.question_id);
    return {
      id: r.id,
      questionId: r.question_id,
      subject: r.subject,
      chapter: r.chapter,
      correct: !!r.correct,
      createdAt: r.created_at,
      stem: q?.stem || "",
    };
  });
}

export interface FullBankQuestion {
  id: string;
  subject: string;
  chapter: string;
  topic: string;
  stem: string;
  options: { key: string; text: string }[];
  answer: string;
  explanation: string;
  year: number;
  number: number;
}

export function sampleBankQuestions(count = 10): FullBankQuestion[] {
  const all = [...pool().byId.values()];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return all.slice(0, count).map(q => ({
    id: q.id,
    subject: q.subject,
    chapter: q.chapter,
    topic: q.topic || "",
    stem: q.stem,
    options: q.options,
    answer: q.answer,
    explanation: q.explanation || "",
    year: q.year,
    number: q.number,
  }));
}


export function getRandomQuestionDetail(id: string) {
  const q = pool().byId.get(id);
  if (!q) return null;
  return {
    id: q.id,
    subject: q.subject,
    chapter: q.chapter,
    topic: q.topic || "",
    type: q.type,
    stem: q.stem,
    options: q.options,
    answer: answerLetter(q),
    explanation: q.explanation || "",
  };
}

export function getLatestRandomAttempt(userId: string, questionId: string) {
  const row = getDb().prepare(
    `SELECT answer, correct, created_at FROM random_attempts
     WHERE user_id = ? AND question_id = ? ORDER BY created_at DESC LIMIT 1`
  ).get(userId, questionId) as Record<string, any> | undefined;
  return row ? { answer: row.answer, correct: !!row.correct, createdAt: row.created_at } : null;
}
