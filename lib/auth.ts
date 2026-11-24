import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { getDb, newId, nowIso } from "./db";
import { verifyPassword } from "./password";

export const SESSION_COOKIE = "yantu_session";

export interface Session {
  id: string;
  kind: "user" | "guest";
  userId: string | null;
  username: string | null;
  displayName: string;
  expiresAt: string;
}

type Row = Record<string, any>;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function isoPlus(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

export async function createSession(input: {
  userId?: string | null;
  kind: "user" | "guest";
  displayName: string;
  ttlMs?: number;
}): Promise<Session> {
  const db = getDb();
  const token = randomBytes(32).toString("hex");
  const id = newId("sess");
  const now = nowIso();
  const expiresAt = isoPlus(input.ttlMs ?? (input.kind === "guest" ? 2 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000));
  db.prepare(
    `INSERT INTO sessions (id, token_hash, user_id, kind, display_name, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, hashToken(token), input.userId || null, input.kind, input.displayName, now, expiresAt);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
  return {
    id,
    kind: input.kind,
    userId: input.userId || null,
    username: null,
    displayName: input.displayName,
    expiresAt,
  };
}

export const getSession = cache(async (): Promise<Session | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const row = db.prepare(
    `SELECT s.*, u.username, u.display_name AS user_display
     FROM sessions s LEFT JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  ).get(hashToken(token), nowIso()) as Row | undefined;
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    userId: row.user_id || null,
    username: row.username || null,
    displayName: row.user_display || row.display_name || "同学",
    expiresAt: row.expires_at,
  };
});

export async function requireUserPage(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.kind !== "user" || !s.userId) redirect("/match");
  return s;
}

export async function requireSessionPage(next = "/match"): Promise<Session> {
  const s = await getSession();
  if (!s) redirect(`/login?next=${encodeURIComponent(next)}`);
  return s;
}

export async function requireUserApi(): Promise<{ session: Session; userId: string } | null> {
  const s = await getSession();
  if (!s || s.kind !== "user" || !s.userId) return null;
  return { session: s, userId: s.userId };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = getDb();
    db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).run(hashToken(token));
  }
  jar.delete(SESSION_COOKIE);
}

export async function loginUser(username: string, password: string): Promise<Session | null> {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM users WHERE lower(username) = lower(?)`).get(username.trim()) as Row | undefined;
  if (!row || !verifyPassword(password, row.password_hash)) return null;
  const session = await createSession({ userId: row.id, kind: "user", displayName: row.display_name });
  return { ...session, username: row.username };
}

export async function createGuestSession(): Promise<Session> {
  const name = `游客${Math.floor(1000 + Math.random() * 9000)}`;
  return createSession({ kind: "guest", displayName: name, ttlMs: 2 * 60 * 60 * 1000 });
}
