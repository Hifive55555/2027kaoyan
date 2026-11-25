import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as cheerio from "cheerio";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const SOURCE_ROOT = process.env.EXTERNAL_SRC || path.join(ROOT, ".cache/external");
export const ASSET_ROOT = path.join(ROOT, "public/assets/external");

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function safeName(value) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140) || "asset";
}

export function copyAsset(src, namespace, preferredName) {
  if (!src || /^https?:/i.test(src) || src.startsWith("data:")) return src || "";
  const clean = src.split("#")[0].split("?")[0];
  const abs = path.isAbsolute(clean) ? clean : path.resolve(SOURCE_ROOT, clean);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return "";
  const ext = path.extname(abs).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext)) return "";
  const rel = preferredName || path.relative(SOURCE_ROOT, abs);
  const destRel = path.join(namespace, safeName(rel.replace(/[\\/]/g, "__")));
  const dest = path.join(ASSET_ROOT, destRel);
  ensureDir(path.dirname(dest));
  fs.copyFileSync(abs, dest);
  return `/assets/external/${destRel.split(path.sep).join("/")}`;
}

export function copyRelativeAsset(src, namespace, baseDir) {
  if (!src || /^https?:/i.test(src) || src.startsWith("data:")) return "";
  const abs = path.resolve(baseDir || SOURCE_ROOT, src.split("#")[0].split("?")[0]);
  if (!fs.existsSync(abs)) return "";
  const rel = path.relative(SOURCE_ROOT, abs);
  return copyAsset(abs, namespace, rel);
}

export function imgMd(url, alt = "题图") {
  return url ? `\n\n![${alt}](${url})\n\n` : "";
}

export function stripHtml(html, { keepImages = false, imageBase = "", namespace = "", alt = "图" } = {}) {
  if (!html) return "";
  const $ = cheerio.load(`<div id="__x">${String(html)}</div>`, { decodeEntities: true });
  const root = $("#__x");
  const images = [];
  root.find("img").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (!src) return;
    let url = src;
    if (keepImages) {
      if (/^https?:/i.test(src)) url = src;
      else url = copyRelativeAsset(src, namespace, imageBase);
    }
    if (url) images.push(imgMd(url, $(el).attr("alt") || alt));
    $(el).remove();
  });
  root.find("br").replaceWith("\n");
  root.find("li").each((_, el) => { $(el).prepend("- "); $(el).append("\n"); });
  root.find("p,div,h1,h2,h3,h4,tr").each((_, el) => { $(el).append("\n"); });
  root.find("code").each((_, el) => { $(el).replaceWith(`\`${$(el).text()}\``); });
  let text = root.text()
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (images.length) text += `\n\n${images.join("").trim()}`;
  return text;
}

export function splitInlineOptions(text) {
  const src = String(text || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const marks = [...src.matchAll(/(?:^|[\s　])([A-D])[.．、]\s*/g)];
  if (marks.length < 2) return null;
  const out = [];
  for (let i = 0; i < marks.length; i++) {
    const m = marks[i];
    const start = (m.index || 0) + m[0].length;
    const end = i + 1 < marks.length ? marks[i + 1].index : src.length;
    out.push({ key: m[1], text: src.slice(start, end).replace(/^[\s　]+|[\s　]+$/g, "") });
  }
  return out.filter(o => o.text);
}

export function normalizeAnswer(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 8);
}

export function questionId(prefix, value) {
  const hash = crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 12);
  return `${prefix}-${hash}`;
}

export function writeBank(file, meta, questions) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify({ meta, questions }, null, 1));
  console.log(`  ${path.relative(ROOT, file)}: ${questions.length} questions`);
}

export function cleanText(value, max = 0) {
  let s = String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (max && s.length > max) s = s.slice(0, max).trimEnd() + "…";
  return s;
}

export function htmlToMarkdown(input, opts = {}) {
  return stripHtml(input, { keepImages: true, ...opts });
}

export function mapMathChapter(title) {
  const t = String(title || "");
  if (/极限|连续/.test(t)) return "高等数学 · 函数、极限、连续";
  if (/导数|微分(?!方程)|中值定理|不等式|零点|洛必达|泰勒/.test(t)) return "高等数学 · 一元函数微分学";
  if (/积分(?!方程)/.test(t)) return "高等数学 · 一元函数积分学";
  if (/多元函数微分|偏导|二重积分|多元函数微积分/.test(t)) return "高等数学 · 多元函数微积分学";
  if (/微分方程/.test(t)) return "高等数学 · 常微分方程";
  if (/行列式/.test(t)) return "线性代数 · 行列式";
  if (/矩阵/.test(t)) return "线性代数 · 矩阵";
  if (/向量/.test(t)) return "线性代数 · 向量";
  if (/线性方程组/.test(t)) return "线性代数 · 线性方程组";
  if (/特征值|特征向量|相似/.test(t)) return "线性代数 · 特征值与特征向量";
  if (/二次型/.test(t)) return "线性代数 · 二次型";
  return `高等数学 · ${t || "综合"}`;
}
