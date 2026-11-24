#!/usr/bin/env node
import { DatabaseSync } from "node:sqlite";
import { randomBytes, scryptSync, randomUUID } from "node:crypto";

const [username, password, display] = process.argv.slice(2);
if (!username || !password) {
  console.error("用法: APP_DB_PATH=/path/to/app.db node scripts/set-password.mjs <用户名> <新密码> [显示名]");
  process.exit(1);
}
const file = process.env.APP_DB_PATH || "data/app.db";
const db = new DatabaseSync(file);
const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64).toString("hex");
const stored = `scrypt$${salt}$${hash}`;
const row = db.prepare("SELECT id FROM users WHERE lower(username) = lower(?)").get(username);
if (row) {
  db.prepare("UPDATE users SET password_hash = ?, display_name = COALESCE(?, display_name) WHERE id = ?")
    .run(stored, display || null, row.id);
  console.log("已更新密码:", username);
} else {
  db.prepare("INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(randomUUID().replace(/-/g, "").slice(0, 20), username, display || username, stored, new Date().toISOString());
  console.log("已创建用户:", username);
}
