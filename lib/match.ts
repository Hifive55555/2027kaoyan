import { getDb, newId, nowIso } from "./db";
import type { Session } from "./auth";
import { generateMatchQuestions, type MatchQuestion } from "./match-questions";

type Row = Record<string, any>;
const TOTAL = 10;

type Queue = { sessionId: string; matchId: string; at: number };
declare global {
  var __yantuMatchQueue: Queue | null | undefined;
  var __yantuMatchGen: Set<string> | undefined;
}

function queue(): Queue | null {
  return globalThis.__yantuMatchQueue || null;
}
function setQueue(q: Queue | null) {
  globalThis.__yantuMatchQueue = q;
}
function genSet(): Set<string> {
  if (!globalThis.__yantuMatchGen) globalThis.__yantuMatchGen = new Set();
  return globalThis.__yantuMatchGen;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function loadMatch(matchId: string): Row | undefined {
  return getDb().prepare(`SELECT * FROM matches WHERE id = ?`).get(matchId) as Row | undefined;
}

function loadPlayers(matchId: string): Row[] {
  return getDb().prepare(`SELECT * FROM match_players WHERE match_id = ?`).all(matchId) as Row[];
}

function loadQuestion(matchId: string, idx: number): Row | undefined {
  return getDb().prepare(`SELECT * FROM match_questions WHERE match_id = ? AND idx = ?`).get(matchId, idx) as Row | undefined;
}

function addPlayer(matchId: string, session: Session) {
  getDb().prepare(
    `INSERT OR IGNORE INTO match_players
     (match_id, session_id, user_id, display_name, is_guest, score, current_index, last_seen)
     VALUES (?, ?, ?, ?, ?, 0, 0, ?)`
  ).run(matchId, session.id, session.userId || null, session.displayName, session.kind === "guest" ? 1 : 0, nowIso());
}

function activeMatch(sessionId: string): Row | undefined {
  return getDb().prepare(
    `SELECT m.* FROM matches m JOIN match_players p ON p.match_id = m.id
     WHERE p.session_id = ? AND m.status IN ('waiting','generating','ready','running')
     ORDER BY m.created_at DESC LIMIT 1`
  ).get(sessionId) as Row | undefined;
}

export function cleanupStaleMatches() {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    `UPDATE matches SET status='cancelled', finished_at=?
     WHERE status IN ('waiting','generating','ready') AND created_at < ?`
  ).run(nowIso(), iso(now - 3 * 60 * 1000));
  db.prepare(
    `UPDATE matches SET status='cancelled', finished_at=?
     WHERE status='running' AND created_at < ?`
  ).run(nowIso(), iso(now - 30 * 60 * 1000));
  const q = queue();
  if (q && now - q.at > 90_000) setQueue(null);
}

function startGeneration(matchId: string) {
  if (genSet().has(matchId)) return;
  genSet().add(matchId);
  void (async () => {
    try {
      const questions = await generateMatchQuestions();
      const db = getDb();
      const m = loadMatch(matchId);
      if (!m || m.status !== "generating") return;
      db.exec("BEGIN");
      try {
        const insert = db.prepare(
          `INSERT OR REPLACE INTO match_questions
           (match_id, idx, subject, chapter, type, stem, options, answer, explanation, time_limit, score, difficulty)
           VALUES (?, ?, ?, ?, 'choice', ?, ?, ?, ?, ?, ?, ?)`
        );
        questions.slice(0, TOTAL).forEach((q: MatchQuestion, i: number) => {
          insert.run(matchId, i, q.subject, q.chapter, q.stem, JSON.stringify(q.options), q.answer, q.explanation, q.timeLimit, q.score, q.difficulty);
        });
        const startAt = iso(Date.now() + 5000);
        db.prepare(`UPDATE matches SET status='ready', started_at=? WHERE id=?`).run(startAt, matchId);
        db.prepare(`UPDATE match_players SET question_started_at=? WHERE match_id=?`).run(startAt, matchId);
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        console.error("match questions insert failed", e);
        throw e;
      }
    } catch (e) {
      console.error("match generation failed", e);
      getDb().prepare(`UPDATE matches SET status='cancelled', finished_at=? WHERE id=? AND status='generating'`).run(nowIso(), matchId);
    } finally {
      genSet().delete(matchId);
    }
  })();
}

export function joinMatch(session: Session): { matchId: string; status: string } {
  const db = getDb();
  cleanupStaleMatches();
  const active = activeMatch(session.id);
  if (active) return { matchId: active.id, status: active.status };

  const q = queue();
  if (q && q.sessionId !== session.id && Date.now() - q.at < 60_000) {
    const m = loadMatch(q.matchId);
    const waitingPlayers = m ? loadPlayers(q.matchId) : [];
    const host = waitingPlayers[0];
    const hostFresh = host ? Date.now() - Date.parse(host.last_seen || "0") < 25_000 : false;
    if (m && m.status === "waiting" && hostFresh) {
      addPlayer(q.matchId, session);
      db.prepare(`UPDATE matches SET status='generating' WHERE id=?`).run(q.matchId);
      setQueue(null);
      startGeneration(q.matchId);
      return { matchId: q.matchId, status: "generating" };
    }
    setQueue(null);
  }
  if (q && Date.now() - q.at >= 60_000) {
    db.prepare(`UPDATE matches SET status='cancelled', finished_at=? WHERE id=? AND status='waiting'`).run(nowIso(), q.matchId);
    setQueue(null);
  }

  const matchId = newId("mt");
  db.prepare(`INSERT INTO matches (id, status, created_at, meta) VALUES (?, 'waiting', ?, '{}')`).run(matchId, nowIso());
  addPlayer(matchId, session);
  setQueue({ sessionId: session.id, matchId, at: Date.now() });
  return { matchId, status: "waiting" };
}

function finalize(matchId: string) {
  const db = getDb();
  const m = loadMatch(matchId);
  if (!m || m.status !== "running") return;
  const players = loadPlayers(matchId);
  if (players.length < 2 || !players.every(p => p.finished_at)) return;
  const sorted = [...players].sort((a, b) => {
    if (Number(b.score) !== Number(a.score)) return Number(b.score) - Number(a.score);
    return String(a.finished_at).localeCompare(String(b.finished_at));
  });
  const winner = Number(sorted[0].score) !== Number(sorted[1].score) ||
    String(sorted[0].finished_at) !== String(sorted[1].finished_at) ? sorted[0].session_id : null;
  db.prepare(`UPDATE matches SET status='finished', finished_at=?, winner_session_id=? WHERE id=?`)
    .run(nowIso(), winner, matchId);
}

function advanceExpired(matchId: string) {
  const db = getDb();
  let m = loadMatch(matchId);
  if (!m) return;
  const now = Date.now();
  if (m.status === "ready") {
    if (now < Date.parse(m.started_at || "")) return;
    db.prepare(`UPDATE matches SET status='running' WHERE id=?`).run(matchId);
    m = loadMatch(matchId)!;
  }
  if (m.status !== "running") return;
  const players = loadPlayers(matchId);
  for (const p of players) {
    let idx = Number(p.current_index) || 0;
    let started = p.question_started_at ? Date.parse(p.question_started_at) : Date.parse(m.started_at || "");
    let finished = p.finished_at || null;
    let changed = false;
    while (!finished && idx < TOTAL) {
      const q = loadQuestion(matchId, idx);
      if (!q) {
        finished = nowIso();
        changed = true;
        break;
      }
      if (Number.isFinite(started) && now - started <= Number(q.time_limit) * 1000 + 800) break;
      db.prepare(
        `INSERT OR IGNORE INTO match_answers (match_id, session_id, idx, answer, correct, score, elapsed_ms, created_at)
         VALUES (?, ?, ?, '', 0, 0, ?, ?)`
      ).run(matchId, p.session_id, idx, Number(q.time_limit) * 1000, nowIso());
      idx++;
      changed = true;
      if (idx >= TOTAL) finished = nowIso();
      else started = now;
    }
    if (changed) {
      db.prepare(
        `UPDATE match_players SET current_index=?, question_started_at=?, finished_at=? WHERE match_id=? AND session_id=?`
      ).run(idx, idx >= TOTAL ? null : iso(started), finished, matchId, p.session_id);
    }
  }
  finalize(matchId);
}

function playerState(p: Row) {
  return {
    sessionId: p.session_id,
    displayName: p.display_name,
    isGuest: !!p.is_guest,
    score: Number(p.score) || 0,
    currentIndex: Number(p.current_index) || 0,
    finished: !!p.finished_at,
  };
}

export function getMatchState(matchId: string, session: Session) {
  const db = getDb();
  advanceExpired(matchId);
  let m = loadMatch(matchId);
  if (!m) throw new Error("比赛不存在");
  const players = loadPlayers(matchId);
  const me = players.find(p => p.session_id === session.id);
  if (!me) throw new Error("你不在这场比赛里");
  db.prepare(`UPDATE match_players SET last_seen=? WHERE match_id=? AND session_id=?`).run(nowIso(), matchId, session.id);
  const opponent = players.find(p => p.session_id !== session.id);

  const base = {
    matchId,
    status: m.status,
    startAt: m.started_at ? Date.parse(m.started_at) : null,
    serverNow: Date.now(),
    total: TOTAL,
    me: playerState(me),
    opponent: opponent ? playerState(opponent) : null,
    winnerSessionId: m.winner_session_id || null,
    winnerName: m.winner_session_id
      ? (players.find(p => p.session_id === m.winner_session_id)?.display_name || null)
      : null,
  };

  if (m.status === "waiting" || m.status === "generating") return { ...base, question: null };
  if (m.status === "cancelled") return { ...base, question: null, message: "比赛已取消" };

  let question: any = null;
  const idx = Number(me.current_index) || 0;
  if (!me.finished_at && idx < TOTAL) {
    const q = loadQuestion(matchId, idx);
    if (q) {
      const start = Date.parse(me.question_started_at || m.started_at || "");
      question = {
        idx,
        number: idx + 1,
        subject: q.subject,
        chapter: q.chapter,
        stem: q.stem,
        options: JSON.parse(q.options || "[]"),
        timeLimit: Number(q.time_limit),
        score: Number(q.score),
        difficulty: q.difficulty,
        deadline: start + Number(q.time_limit) * 1000,
      };
    }
  }

  let review: any[] | undefined;
  if (m.status === "finished") {
    const qs = db.prepare(`SELECT * FROM match_questions WHERE match_id = ? ORDER BY idx`).all(matchId) as Row[];
    const answers = db.prepare(`SELECT * FROM match_answers WHERE match_id = ?`).all(matchId) as Row[];
    review = qs.map(q => {
      const mine = answers.find(a => a.session_id === session.id && Number(a.idx) === Number(q.idx));
      const theirs = opponent ? answers.find(a => a.session_id === opponent.session_id && Number(a.idx) === Number(q.idx)) : null;
      return {
        idx: Number(q.idx),
        subject: q.subject,
        chapter: q.chapter,
        stem: q.stem,
        options: JSON.parse(q.options || "[]"),
        answer: q.answer,
        explanation: q.explanation,
        myAnswer: mine?.answer || "",
        myCorrect: !!mine?.correct,
        opponentAnswer: theirs?.answer || "",
        opponentCorrect: !!theirs?.correct,
      };
    });
  }

  return { ...base, status: m.status, question, review };
}

export function submitAnswer(matchId: string, session: Session, idx: number, rawAnswer: string) {
  const db = getDb();
  advanceExpired(matchId);
  let m = loadMatch(matchId);
  if (!m) throw new Error("比赛不存在");
  if (m.status !== "running") return { stale: true, state: getMatchState(matchId, session) };
  const players = loadPlayers(matchId);
  const me = players.find(p => p.session_id === session.id);
  if (!me) throw new Error("你不在这场比赛里");
  if (me.finished_at || Number(me.current_index) !== idx) return { stale: true, state: getMatchState(matchId, session) };
  const q = loadQuestion(matchId, idx);
  if (!q) return { stale: true, state: getMatchState(matchId, session) };
  const now = Date.now();
  const start = Date.parse(me.question_started_at || m.started_at || "");
  const elapsed = now - start;
  if (elapsed > Number(q.time_limit) * 1000 + 1500) {
    db.prepare(
      `INSERT OR IGNORE INTO match_answers (match_id, session_id, idx, answer, correct, score, elapsed_ms, created_at)
       VALUES (?, ?, ?, '', 0, 0, ?, ?)`
    ).run(matchId, session.id, idx, Number(q.time_limit) * 1000, nowIso());
    const next = idx + 1;
    db.prepare(
      `UPDATE match_players SET current_index=?, question_started_at=?, finished_at=? WHERE match_id=? AND session_id=?`
    ).run(next, next >= TOTAL ? null : nowIso(), next >= TOTAL ? nowIso() : null, matchId, session.id);
    finalize(matchId);
    return { timeout: true, correct: false, answer: q.answer, explanation: q.explanation, state: getMatchState(matchId, session) };
  }

  const answer = String(rawAnswer || "").toUpperCase().replace(/[^A-D]/g, "").slice(0, 1);
  const correct = answer === String(q.answer).trim().toUpperCase();
  const score = correct ? Number(q.score) : 0;
  const res = db.prepare(
    `INSERT OR IGNORE INTO match_answers (match_id, session_id, idx, answer, correct, score, elapsed_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(matchId, session.id, idx, answer, correct ? 1 : 0, score, elapsed, nowIso());
  if (Number(res.changes) === 0) return { stale: true, state: getMatchState(matchId, session) };
  const next = idx + 1;
  db.prepare(
    `UPDATE match_players SET score=score+?, current_index=?, question_started_at=?, finished_at=? WHERE match_id=? AND session_id=?`
  ).run(score, next, next >= TOTAL ? null : nowIso(), next >= TOTAL ? nowIso() : null, matchId, session.id);
  finalize(matchId);
  return {
    correct,
    score,
    answer: q.answer,
    explanation: q.explanation,
    state: getMatchState(matchId, session),
  };
}

export function timeoutMatch(matchId: string, session: Session) {
  advanceExpired(matchId);
  return getMatchState(matchId, session);
}

export function cancelMatch(matchId: string, session: Session) {
  const db = getDb();
  const players = loadPlayers(matchId);
  if (!players.some(p => p.session_id === session.id)) throw new Error("你不在这场比赛里");
  const m = loadMatch(matchId);
  if (!m) return;
  if (["waiting", "generating", "ready"].includes(m.status)) {
    db.prepare(`UPDATE matches SET status='cancelled', finished_at=? WHERE id=?`).run(nowIso(), matchId);
    const q = queue();
    if (q?.matchId === matchId) setQueue(null);
  }
}

export interface RecentMatch {
  matchId: string;
  score: number;
  opponentName: string;
  opponentScore: number;
  result: "win" | "lose" | "draw";
  finishedAt: string;
}

export function getRecentMatches(userId: string, limit = 5): RecentMatch[] {
  const db = getDb();
  const rows = db.prepare(
    `SELECT m.id, m.finished_at, m.winner_session_id, p.session_id, p.score,
       (SELECT display_name FROM match_players op WHERE op.match_id = m.id AND op.session_id <> p.session_id LIMIT 1) AS opponent_name,
       (SELECT score FROM match_players op WHERE op.match_id = m.id AND op.session_id <> p.session_id LIMIT 1) AS opponent_score
     FROM matches m JOIN match_players p ON p.match_id = m.id
     WHERE p.user_id = ? AND m.status = 'finished'
     ORDER BY m.finished_at DESC LIMIT ?`
  ).all(userId, limit) as Row[];
  return rows.map(r => ({
    matchId: r.id,
    score: Number(r.score) || 0,
    opponentName: r.opponent_name || "对手",
    opponentScore: Number(r.opponent_score) || 0,
    result: r.winner_session_id === r.session_id ? "win" : r.winner_session_id ? "lose" : "draw",
    finishedAt: r.finished_at || "",
  }));
}
