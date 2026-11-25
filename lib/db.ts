import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { hashPassword } from "./password";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = process.env.APP_DB_PATH || path.join(DATA_DIR, "app.db");

type GlobalWithDb = typeof globalThis & { __yantuDb?: DatabaseSync };

function hasColumn(db: DatabaseSync, table: string, col: string): boolean {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Record<string, unknown>[];
    return rows.some(r => r.name === col);
  } catch {
    return false;
  }
}

function addColumn(db: DatabaseSync, table: string, col: string, def: string) {
  if (!hasColumn(db, table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}

function seedUsers(db: DatabaseSync) {
  const defs = [
    {
      username: process.env.YANTU_USER1_USERNAME || "hifive",
      password: process.env.YANTU_USER1_PASSWORD || "",
      display: process.env.YANTU_USER1_DISPLAY || "Hifive",
    },
    {
      username: process.env.YANTU_USER2_USERNAME || "study",
      password: process.env.YANTU_USER2_PASSWORD || "",
      display: process.env.YANTU_USER2_DISPLAY || "Study",
    },
  ];
  for (const u of defs) {
    if (!u.password) continue;
    const exists = db.prepare("SELECT id FROM users WHERE lower(username) = lower(?)").get(u.username) as Record<string, unknown> | undefined;
    if (exists) continue;
    db.prepare(
      `INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)`
    ).run(crypto.randomUUID().replace(/-/g, "").slice(0, 20), u.username, u.display, hashPassword(u.password), new Date().toISOString());
  }
  // Legacy rows created before multi-user existed belong to the first account.
  const owner = db.prepare("SELECT id FROM users ORDER BY created_at LIMIT 1").get() as { id: string } | undefined;
  if (owner) {
    db.prepare("UPDATE papers SET user_id = ? WHERE user_id IS NULL").run(owner.id);
    db.prepare("UPDATE attempts SET user_id = ? WHERE user_id IS NULL").run(owner.id);
    db.prepare("UPDATE messages SET user_id = ? WHERE user_id IS NULL").run(owner.id);
  }
}

function migrateTutorConversations(db: DatabaseSync) {
  const users = db.prepare(
    `SELECT DISTINCT user_id FROM tutor_messages WHERE conversation_id IS NULL AND user_id IS NOT NULL`
  ).all() as { user_id: string }[];
  for (const { user_id } of users) {
    let conv = db.prepare(`SELECT id FROM tutor_conversations WHERE user_id = ? ORDER BY created_at LIMIT 1`).get(user_id) as { id: string } | undefined;
    if (!conv) {
      const first = db.prepare(`SELECT content FROM tutor_messages WHERE user_id = ? AND role = 'user' ORDER BY created_at LIMIT 1`).get(user_id) as { content: string } | undefined;
      const title = String(first?.content || "历史对话").replace(/\s+/g, " ").trim().slice(0, 28) || "历史对话";
      const id = `tc_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      const now = new Date().toISOString();
      db.prepare(`INSERT INTO tutor_conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`)
        .run(id, user_id, title, now, now);
      conv = { id };
    }
    db.prepare(`UPDATE tutor_messages SET conversation_id = ? WHERE user_id = ? AND conversation_id IS NULL`)
      .run(conv.id, user_id);
  }
}

function migrateTutorRoadmapConversations(db: DatabaseSync) {
  const users = db.prepare(
    `SELECT DISTINCT user_id FROM tutor_roadmap WHERE conversation_id IS NULL AND user_id IS NOT NULL`
  ).all() as { user_id: string }[];
  for (const { user_id } of users) {
    // The pre-conversation roadmap belonged to the original long-running
    // conversation. Attach it to the earliest conversation, not the newest
    // one a user may have just created.
    let conv = db.prepare(
      `SELECT id FROM tutor_conversations WHERE user_id = ? ORDER BY created_at ASC LIMIT 1`
    ).get(user_id) as { id: string } | undefined;
    if (!conv) {
      const id = `tc_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      const now = new Date().toISOString();
      db.prepare(
        `INSERT INTO tutor_conversations (id, user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
      ).run(id, user_id, "历史学习路线", now, now);
      conv = { id };
    }
    db.prepare(
      `UPDATE tutor_roadmap SET conversation_id = ? WHERE user_id = ? AND conversation_id IS NULL`
    ).run(conv.id, user_id);
  }
}

function migrate(db: DatabaseSync) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      chapter TEXT NOT NULL,
      mode TEXT NOT NULL,
      title TEXT NOT NULL,
      duration_min INTEGER NOT NULL DEFAULT 45,
      blueprint TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sections (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      material TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      idx INTEGER NOT NULL,
      type TEXT NOT NULL,
      stem TEXT NOT NULL,
      options TEXT NOT NULL DEFAULT '[]',
      answer TEXT NOT NULL DEFAULT '""',
      explanation TEXT NOT NULL DEFAULT '',
      rubric TEXT NOT NULL DEFAULT '[]',
      score REAL NOT NULL DEFAULT 0,
      difficulty TEXT NOT NULL DEFAULT '提高',
      topic TEXT NOT NULL DEFAULT '',
      chapter TEXT NOT NULL DEFAULT '',
      source_note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY,
      paper_id TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      answer TEXT NOT NULL DEFAULT '',
      image_path TEXT,
      score REAL,
      max_score REAL,
      verdict TEXT,
      feedback TEXT NOT NULL DEFAULT '{}',
      skipped INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      paper_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_questions_paper ON questions(paper_id, idx);
    CREATE INDEX IF NOT EXISTS idx_attempts_paper ON attempts(paper_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_attempts_question ON attempts(question_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_messages_question ON messages(question_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_papers_created ON papers(created_at);

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id TEXT,
      kind TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS uploads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      file_name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS upload_tickets (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      file_name TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tutor_conversations (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '新的对话',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS tutor_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      quiz_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tutor_quizzes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      chapter TEXT NOT NULL DEFAULT '',
      topic TEXT NOT NULL DEFAULT '',
      difficulty TEXT NOT NULL DEFAULT '提高',
      stem TEXT NOT NULL,
      options TEXT NOT NULL DEFAULT '[]',
      answer TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tutor_roadmap (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      conversation_id TEXT,
      parent_id TEXT,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tutor_checks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'yesno',
      prompt TEXT NOT NULL,
      options TEXT NOT NULL DEFAULT '[]',
      answer TEXT NOT NULL DEFAULT '',
      placeholder TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tutor_check_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      check_id TEXT NOT NULL,
      response TEXT NOT NULL DEFAULT '',
      correct INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tutor_quiz_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      quiz_id TEXT NOT NULL,
      answer TEXT NOT NULL DEFAULT '',
      correct INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS learner_notes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, kind)
    );

    CREATE TABLE IF NOT EXISTS random_messages (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS random_generated_questions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      chapter TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      used_at TEXT
    );

    CREATE TABLE IF NOT EXISTS random_attempts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      question_id TEXT NOT NULL,
      subject TEXT NOT NULL,
      chapter TEXT NOT NULL DEFAULT '',
      answer TEXT NOT NULL DEFAULT '',
      correct INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT,
      winner_session_id TEXT,
      meta TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS match_players (
      match_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      user_id TEXT,
      display_name TEXT NOT NULL,
      is_guest INTEGER NOT NULL DEFAULT 0,
      score REAL NOT NULL DEFAULT 0,
      current_index INTEGER NOT NULL DEFAULT 0,
      question_started_at TEXT,
      finished_at TEXT,
      last_seen TEXT,
      PRIMARY KEY (match_id, session_id)
    );

    CREATE TABLE IF NOT EXISTS match_questions (
      match_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      subject TEXT NOT NULL,
      chapter TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'choice',
      stem TEXT NOT NULL,
      options TEXT NOT NULL DEFAULT '[]',
      answer TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      time_limit INTEGER NOT NULL DEFAULT 45,
      score REAL NOT NULL DEFAULT 5,
      difficulty TEXT NOT NULL DEFAULT '提高',
      PRIMARY KEY (match_id, idx)
    );

    CREATE TABLE IF NOT EXISTS match_answers (
      match_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      idx INTEGER NOT NULL,
      answer TEXT NOT NULL DEFAULT '',
      correct INTEGER NOT NULL DEFAULT 0,
      score REAL NOT NULL DEFAULT 0,
      elapsed_ms INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      PRIMARY KEY (match_id, session_id, idx)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_random_user ON random_attempts(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_random_generated_user ON random_generated_questions(user_id, used_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_random_messages ON random_messages(user_id, question_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tutor_messages_user ON tutor_messages(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tutor_conversations_user ON tutor_conversations(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_tutor_quizzes_user ON tutor_quizzes(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tutor_attempts_user ON tutor_quiz_attempts(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tutor_checks_user ON tutor_checks(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tutor_roadmap_user ON tutor_roadmap(user_id, parent_id, sort);
    CREATE INDEX IF NOT EXISTS idx_tutor_check_attempts_user ON tutor_check_attempts(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_uploads_user ON uploads(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_upload_tickets_user ON upload_tickets(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_upload_tickets_expires ON upload_tickets(expires_at);
    CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_match_players_session ON match_players(session_id);
  `);
  addColumn(db, "papers", "user_id", "TEXT");
  addColumn(db, "attempts", "user_id", "TEXT");
  addColumn(db, "messages", "user_id", "TEXT");
  addColumn(db, "tutor_messages", "check_id", "TEXT");
  addColumn(db, "tutor_messages", "conversation_id", "TEXT");
  addColumn(db, "tutor_roadmap", "conversation_id", "TEXT");
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tutor_messages_conversation ON tutor_messages(conversation_id, created_at);`);
  migrateTutorConversations(db);
  migrateTutorRoadmapConversations(db);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tutor_roadmap_conversation ON tutor_roadmap(conversation_id, user_id, parent_id, sort);`);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_papers_user ON papers(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id, created_at);
  `);
  seedUsers(db);
}

export function getDb(): DatabaseSync {
  const g = globalThis as GlobalWithDb;
  if (g.__yantuDb) return g.__yantuDb;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new DatabaseSync(DB_PATH);
  migrate(db);
  g.__yantuDb = db;
  return db;
}

export function newId(prefix = ""): string {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 20);
  return prefix ? `${prefix}_${id}` : id;
}

export function nowIso(): string {
  return new Date().toISOString();
}
