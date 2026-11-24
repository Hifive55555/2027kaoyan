import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SRC = process.env.ENGLISH2_SRC || path.join(ROOT, "data/raw/english-ii");
const OUT = path.join(ROOT, "data/corpus/english2");

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(SRC, OUT, { recursive: true });

const years = fs.readdirSync(SRC).filter(d => /^\d{4}$/.test(d)).map(Number).sort();
const indexRows = [];

function sectionAfter(text, heading) {
  const i = text.indexOf(heading);
  if (i < 0) return "";
  return text.slice(i + heading.length).trim();
}

for (const year of years) {
  const dir = path.join(OUT, String(year));
  const paper = fs.readFileSync(path.join(dir, "paper.md"), "utf8").trim();
  const answers = JSON.parse(fs.readFileSync(path.join(dir, "answers.json"), "utf8"));
  const translation = fs.existsSync(path.join(dir, "translation.md")) ? fs.readFileSync(path.join(dir, "translation.md"), "utf8") : "";
  const writing = fs.existsSync(path.join(dir, "writing.md")) ? fs.readFileSync(path.join(dir, "writing.md"), "utf8") : "";

  const lines = [];
  lines.push("---");
  lines.push("subject: english2");
  lines.push(`year: ${year}`);
  lines.push("source: Echo1LZJY/echo-kaoyan-english-skill");
  lines.push("quality: 真题文本 + 公开答案 + Echo 参考译文/范文");
  lines.push("---");
  lines.push("");
  lines.push(paper.replace(/^# .*\n+/, ""));
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 参考答案");
  lines.push("");
  lines.push("| 题号 | 答案 | 题号 | 答案 | 题号 | 答案 | 题号 | 答案 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- | --- |");
  const flat = [];
  for (const [sec, map] of Object.entries(answers.answers || {})) {
    for (const [num, ans] of Object.entries(map)) flat.push([Number(num), ans, sec]);
  }
  flat.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < flat.length; i += 4) {
    const row = flat.slice(i, i + 4);
    while (row.length < 4) row.push(["", "", ""]);
    lines.push(`| ${row.map(([n, a]) => `${n || ""} | ${a || ""}`).join(" | ")} |`);
  }
  lines.push("");

  const transRef = sectionAfter(translation, "### Echo 参考译文");
  if (transRef) {
    lines.push("## 翻译参考译文");
    lines.push("");
    lines.push(transRef.split("<!-- echo-enrichment:end -->")[0].trim());
    lines.push("");
  }

  const writeRef = sectionAfter(writing, "### Echo 参考范文");
  if (writeRef) {
    lines.push("## 写作参考范文");
    lines.push("");
    lines.push(writeRef.split("<!-- echo-enrichment:end -->")[0].trim());
    lines.push("");
  }

  fs.writeFileSync(path.join(OUT, `${year}.md`), lines.join("\n"));

  const counts = { cloze: 20, reading: 20, newType: 5, translation: 1, writing: 2 };
  indexRows.push({ year, ...counts });
}

const index = [
  "---",
  "subject: english2",
  "source: Echo1LZJY/echo-kaoyan-english-skill",
  "---",
  "",
  "# 英语（二）真题库",
  "",
  "覆盖 2010—2026 年（英语二自 2010 年开考）。每年含完整试题、客观题答案、参考译文与写作范文。",
  "",
  "| 年份 | 完形 | 阅读 | 新题型 | 翻译 | 写作 | 合卷 |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...[...indexRows].reverse().map(r => `| ${r.year} | ${r.cloze} | ${r.reading} | ${r.newType} | ${r.translation} | ${r.writing} | [合卷](./${r.year}.md) |`),
  "",
  "> 原文与答案来自公开 GitHub 项目，参考译文/范文为第三方 AI 生成，非官方答案，仅用于学习。",
  "",
].join("\n");
fs.writeFileSync(path.join(OUT, "index.md"), index);

fs.mkdirSync(path.join(ROOT, "data/bank"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "data/bank/english2.json"), JSON.stringify({
  meta: {
    subject: "english2",
    name: "英语（二）",
    source: "Echo1LZJY/echo-kaoyan-english-skill",
    years,
    count: years.length * 48,
    note: "每年 48 题：完形 20 + 阅读 20 + 新题型 5 + 翻译 1 + 写作 2；参考译文/范文为 AI 生成。",
  },
  questions: [],
}, null, 0));
console.log(`english2: ${years.length} years copied, combined files written`);
