import fs from "node:fs";
import path from "node:path";
import { getDb, nowIso } from "./db";
import type {
  LearnerChapterStat,
  LearnerMistake,
  LearnerProfile,
  LearnerQuizResult,
  LearnerSubjectStat,
  SubjectId,
} from "./types";

type Row = Record<string, any>;

const SUBJECT_LABEL: Record<SubjectId, string> = {
  math2: "数学二",
  english2: "英语二",
  politics: "政治",
  cs408: "408",
};

const VALID_SUBJECTS = new Set<SubjectId>(["math2", "english2", "politics", "cs408"]);

function parseJson<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function localDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function subjectOf(value: unknown): SubjectId | null {
  return VALID_SUBJECTS.has(value as SubjectId) ? value as SubjectId : null;
}

interface LearningEvent {
  subject: SubjectId;
  chapter: string;
  topic: string;
  stem: string;
  correct: boolean;
  source: "paper" | "random" | "match";
  createdAt: string;
}

function collectEvents(userId: string): LearningEvent[] {
  const db = getDb();
  const events: LearningEvent[] = [];

  // Paper attempts: only the latest attempt per question counts for mastery.
  const paperRows = db.prepare(
    `SELECT a.id, a.answer, a.score, a.max_score, a.verdict, a.created_at,
            q.id AS question_id, q.stem, q.chapter, q.topic, p.subject
     FROM attempts a
     JOIN questions q ON q.id = a.question_id
     JOIN papers p ON p.id = q.paper_id
     WHERE p.user_id = ? AND a.skipped = 0
     ORDER BY a.created_at ASC`
  ).all(userId) as Row[];
  const latestPaper = new Map<string, Row>();
  for (const row of paperRows) latestPaper.set(row.question_id, row);
  for (const row of latestPaper.values()) {
    const subject = subjectOf(row.subject);
    if (!subject) continue;
    events.push({
      subject,
      chapter: row.chapter || "",
      topic: row.topic || "",
      stem: row.stem || "",
      correct: row.verdict === "correct",
      source: "paper",
      createdAt: row.created_at,
    });
  }

  const randomRows = db.prepare(
    `SELECT subject, chapter, question_id, correct, created_at FROM random_attempts
     WHERE user_id = ? ORDER BY created_at DESC LIMIT 300`
  ).all(userId) as Row[];
  for (const row of randomRows) {
    const subject = subjectOf(row.subject);
    if (!subject) continue;
    events.push({
      subject,
      chapter: row.chapter || "",
      topic: "",
      stem: "",
      correct: !!row.correct,
      source: "random",
      createdAt: row.created_at,
    });
  }

  const matchRows = db.prepare(
    `SELECT ma.correct, ma.created_at, mq.subject, mq.chapter, mq.stem
     FROM match_answers ma
     JOIN match_players mp ON mp.match_id = ma.match_id AND mp.session_id = ma.session_id
     JOIN matches m ON m.id = ma.match_id
     JOIN match_questions mq ON mq.match_id = ma.match_id AND mq.idx = ma.idx
     WHERE mp.user_id = ? AND m.finished_at IS NOT NULL
     ORDER BY ma.created_at DESC LIMIT 200`
  ).all(userId) as Row[];
  for (const row of matchRows) {
    const subject = subjectOf(row.subject);
    if (!subject) continue;
    events.push({
      subject,
      chapter: row.chapter || "",
      topic: "",
      stem: row.stem || "",
      correct: !!row.correct,
      source: "match",
      createdAt: row.created_at,
    });
  }

  return events;
}

function buildSubjects(events: LearningEvent[]): Partial<Record<SubjectId, LearnerSubjectStat>> {
  const map: Partial<Record<SubjectId, LearnerSubjectStat>> = {};
  const chapters = new Map<string, Map<string, { attempts: number; wrong: number }>>();

  for (const event of events) {
    let subject = map[event.subject];
    if (!subject) {
      subject = { attempts: 0, correct: 0, accuracy: 0, weakChapters: [] };
      map[event.subject] = subject;
      chapters.set(event.subject, new Map());
    }
    subject.attempts++;
    if (event.correct) subject.correct++;
    if (event.chapter) {
      const cmap = chapters.get(event.subject)!;
      const c = cmap.get(event.chapter) || { attempts: 0, wrong: 0 };
      c.attempts++;
      if (!event.correct) c.wrong++;
      cmap.set(event.chapter, c);
    }
  }

  for (const subject of Object.values(map) as LearnerSubjectStat[]) {
    subject.accuracy = subject.attempts ? Math.round((subject.correct / subject.attempts) * 100) : 0;
  }
  for (const [subjectId, cmap] of chapters) {
    const stat = map[subjectId as SubjectId];
    if (!stat) continue;
    stat.weakChapters = [...cmap.entries()]
      .map(([chapter, c]) => ({
        chapter,
        attempts: c.attempts,
        wrong: c.wrong,
        accuracy: c.attempts ? Math.round(((c.attempts - c.wrong) / c.attempts) * 100) : 0,
      }))
      .filter(c => c.wrong > 0)
      .sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy)
      .slice(0, 3);
  }
  return map;
}

function buildRecentQuiz(userId: string): LearnerQuizResult[] {
  const rows = getDb().prepare(
    `SELECT a.answer, a.correct, a.created_at, q.id, q.subject, q.chapter, q.topic, q.stem, q.options, q.answer AS correct_answer
     FROM tutor_quiz_attempts a JOIN tutor_quizzes q ON q.id = a.quiz_id
     WHERE a.user_id = ? ORDER BY a.created_at DESC LIMIT 8`
  ).all(userId) as Row[];
  return rows
    .filter(row => subjectOf(row.subject))
    .map(row => ({
      quizId: row.id,
      subject: row.subject as SubjectId,
      chapter: row.chapter || "",
      topic: row.topic || "",
      stem: row.stem || "",
      options: parseJson(row.options, []),
      answer: row.answer || "",
      correctAnswer: parseJson(row.correct_answer, ""),
      correct: !!row.correct,
      createdAt: row.created_at,
    }));
}

function streakFromDates(dates: Set<string>): number {
  let streak = 0;
  const cursor = new Date();
  if (!dates.has(localDate(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (dates.has(localDate(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function writeSnapshot(profile: LearnerProfile) {
  try {
    const dir = path.join(process.cwd(), "data/learner");
    fs.mkdirSync(dir, { recursive: true });
    const safeId = profile.userId.replace(/[^a-zA-Z0-9_-]/g, "");
    const target = path.join(dir, `${safeId}.json`);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(profile, null, 2));
    fs.renameSync(tmp, target);
  } catch { /* snapshot is optional; DB remains authoritative */ }
}

export function buildLearnerProfile(userId: string): LearnerProfile {
  const db = getDb();
  const events = collectEvents(userId);
  const dates = new Set(events.map(e => localDate(new Date(e.createdAt))));
  const today = localDate(new Date());
  const mistakes = events.filter(e => !e.correct).length;
  const correct = events.filter(e => e.correct).length;
  const lastActive = events.length
    ? events.reduce((latest, e) => e.createdAt > latest ? e.createdAt : latest, events[0].createdAt)
    : null;

  const recentMistakes: LearnerMistake[] = [];
  const seen = new Set<string>();
  for (const event of [...events].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    if (event.correct || !event.stem) continue;
    const key = `${event.subject}|${event.stem.slice(0, 90)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    recentMistakes.push({
      subject: event.subject,
      chapter: event.chapter,
      topic: event.topic,
      stem: event.stem,
      source: event.source,
      createdAt: event.createdAt,
    });
    if (recentMistakes.length >= 8) break;
  }

  const row = db.prepare(`SELECT content FROM learner_notes WHERE user_id = ? AND kind = 'goal'`).get(userId) as Row | undefined;
  const profile: LearnerProfile = {
    userId,
    overview: {
      totalAttempts: events.length,
      accuracy: events.length ? Math.round((correct / events.length) * 100) : 0,
      streak: streakFromDates(dates),
      todayCount: events.filter(e => localDate(new Date(e.createdAt)) === today).length,
      lastActive,
      mistakes,
    },
    subjects: buildSubjects(events),
    recentMistakes,
    recentQuiz: buildRecentQuiz(userId),
    goal: row?.content || "",
    updatedAt: nowIso(),
  };
  writeSnapshot(profile);
  return profile;
}

function short(text: string, max: number): string {
  const t = text.replace(/[#*`_>]/g, "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

export function toLearnerPrompt(profile: LearnerProfile): string {
  const lines: string[] = [];
  lines.push(`【学习档案】累计 ${profile.overview.totalAttempts} 题，正确率 ${profile.overview.accuracy}%，连续 ${profile.overview.streak} 天，今日 ${profile.overview.todayCount} 题，待复盘错题 ${profile.overview.mistakes} 道。`);
  const subjectEntries = Object.entries(profile.subjects) as [SubjectId, LearnerSubjectStat][];
  if (subjectEntries.length) {
    lines.push("【分科】");
    for (const [id, s] of subjectEntries) {
      const weak = s.weakChapters.length
        ? `；薄弱：${s.weakChapters.map(c => `${c.chapter}(${c.accuracy}%)`).join("、")}`
        : "；暂无明显薄弱章节";
      lines.push(`- ${SUBJECT_LABEL[id]}：${s.attempts} 题，正确率 ${s.accuracy}%${weak}`);
    }
  }
  if (profile.recentMistakes.length) {
    lines.push("【最近错题】");
    for (const m of profile.recentMistakes.slice(0, 5)) {
      lines.push(`- [${SUBJECT_LABEL[m.subject]}${m.chapter ? `/${m.chapter}` : ""}] ${short(m.stem, 90)}`);
    }
  }
  if (profile.recentQuiz.length) {
    lines.push("【最近答疑出题】");
    for (const q of profile.recentQuiz.slice(0, 3)) {
      lines.push(`- ${q.correct ? "答对" : `答错（选 ${q.answer || "?"}，正确 ${q.correctAnswer}）`}：${short(q.stem, 80)}`);
    }
    const latest = profile.recentQuiz[0];
    if (latest.options.length) {
      lines.push(`【学生刚看到的题】${short(latest.stem, 160)}；选项：${latest.options.map(o => `${o.key}.${short(o.text, 40)}`).join(" / ")}`);
    }
  }
  if (profile.goal) lines.push(`【学生目标】${short(profile.goal, 200)}`);
  return lines.join("\n").slice(0, 2400);
}

export function learnerSuggestions(profile: LearnerProfile): string[] {
  const subjectEntries = Object.entries(profile.subjects) as [SubjectId, LearnerSubjectStat][];
  const weak = subjectEntries
    .flatMap(([id, s]) => s.weakChapters.map(c => ({ id, ...c })))
    .sort((a, b) => b.wrong - a.wrong || a.accuracy - b.accuracy)[0];
  const out: string[] = [];
  if (weak) {
    out.push(`我总在${SUBJECT_LABEL[weak.id]}的「${weak.chapter}」上出错，先帮我找到最根本的卡点。`);
    out.push(`从我最近在「${weak.chapter}」的错题里挑一道，带我一步步重做。`);
  }
  if (profile.recentMistakes.length) {
    out.push("从我的最近错题里挑一道最值得先补的，先别直接给答案。");
  }
  out.push("帮我用 20 分钟梳理今天最该复习的一个知识点。");
  out.push("我想先讲讲今天学的一个概念，你帮我检查理解得对不对。");
  return [...new Set(out)].slice(0, 4);
}

export function learnerSubjectLabel(id: SubjectId): string {
  return SUBJECT_LABEL[id];
}
