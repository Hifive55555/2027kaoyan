import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const RAW = process.env.RAW_DIR || path.join(ROOT, "data/raw");
const SRC = path.join(RAW, "math-exam_data.js");
const OUT_BANK = path.join(ROOT, "data/bank/math2.json");
const OUT_CORPUS = path.join(ROOT, "data/corpus/math2");

const TYPE_MAP = { "选择题": "choice", "填空题": "fill", "解答题": "solution" };

const CHAPTER_RULES = [
  ["线性代数 · 二次型", ["二次型", "正定", "合同", "惯性指数", "标准形", "规范形"]],
  ["线性代数 · 特征值与特征向量", ["特征值", "特征向量", "相似对角", "对角化", "相似矩阵", "特征多项式"]],
  ["线性代数 · 线性方程组", ["线性方程组", "基础解系", "同解", "相容", "克拉默"]],
  ["线性代数 · 向量", ["向量组", "线性相关", "线性无关", "极大无关组", "向量空间", "过渡矩阵", "施密特"]],
  ["线性代数 · 行列式", ["行列式", "余子式", "代数余子式", "范德蒙"]],
  ["线性代数 · 矩阵", ["矩阵", "逆矩阵", "伴随矩阵", "初等变换", "矩阵的秩", "分块矩阵", "正交矩阵", "可逆", "秩"]],
  ["高等数学 · 常微分方程", ["微分方程", "通解", "特解", "特征方程", "齐次线性微分", "非齐次", "积分因子"]],
  ["高等数学 · 多元函数微积分学", ["二重积分", "偏导", "全微分", "多元函数", "条件极值", "拉格朗日乘数", "隐函数", "极坐标", "累次积分", "\\partial", "\\iint"]],
  ["高等数学 · 函数、极限、连续", ["极限", "无穷小", "无穷大", "连续", "间断", "等价无穷小", "夹逼", "单调有界"]],
  ["高等数学 · 一元函数积分学", ["不定积分", "定积分", "原函数", "反常积分", "广义积分", "积分上限", "换元积分", "分部积分", "曲边梯形", "旋转体", "弧长", "做功", "压力", "质心", "形心", "平均值", "积分", "\\int"]],
  ["高等数学 · 一元函数微分学", ["导数", "微分", "中值定理", "罗尔", "拉格朗日", "柯西", "泰勒", "洛必达", "单调", "极值", "凹凸", "拐点", "渐近线", "曲率", "切线", "法线", "高阶导"]],
];

function classify(stem) {
  for (const [chapter, words] of CHAPTER_RULES) {
    if (words.some(w => stem.includes(w))) return chapter;
  }
  return "高等数学 · 一元函数微分学";
}

function extractOptions(stem) {
  const options = [];
  const lines = stem.split("\n");
  const optionLines = [];
  const kept = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const inline = trimmed.split(/(?=[（(][A-D][）)])/).filter(Boolean);
    let matched = false;
    if (inline.length >= 2) {
      for (const part of inline) {
        const m = part.match(/^[（(]?([A-D])[）)]?[.、．]?\s*(.+)$/);
        if (m) { optionLines.push({ key: m[1], text: m[2].trim() }); matched = true; }
      }
    }
    if (!matched) {
      const m = trimmed.match(/^[-*]?\s*[（(]?([A-D])[）)]?[.、．]?\s*(.+)$/);
      if (m && !trimmed.startsWith("- A") && !trimmed.startsWith("- B") && !trimmed.startsWith("- C") && !trimmed.startsWith("- D")) {
        optionLines.push({ key: m[1], text: m[2].trim() });
      } else if (m) {
        optionLines.push({ key: m[1], text: m[2].trim() });
      } else {
        kept.push(line);
      }
    }
  }
  if (optionLines.length >= 2) {
    const seen = new Set();
    for (const o of optionLines) {
      if (seen.has(o.key)) continue;
      seen.add(o.key);
      options.push(o);
    }
    return { stem: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), options };
  }
  return { stem: stem.trim(), options: [] };
}

function normalizeAnswer(type, answer) {
  const a = String(answer || "").trim();
  if (type === "choice") {
    const m = a.match(/[A-D]/);
    return m ? m[0] : a;
  }
  return a;
}

const labelsPath = path.join(ROOT, "data/raw/math2-chapters.json");
const labels = fs.existsSync(labelsPath) ? JSON.parse(fs.readFileSync(labelsPath, "utf8")) : {};

const raw = fs.readFileSync(SRC, "utf8");
const arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));

const seen = new Set();
const questions = [];
for (const row of arr) {
  if (!Array.isArray(row) || row.length < 5) continue;
  const [yearS, typeName, number, rawStem, rawAnswer, rawExplanation] = row;
  const year = Number(yearS);
  const type = TYPE_MAP[typeName];
  if (!type || year < 2006 || year > 2026) continue;
  const n = Number(number);
  const expectedType = year === 2006
    ? (n <= 6 ? "fill" : n <= 14 ? "choice" : n <= 23 ? "solution" : null)
    : year === 2007
      ? (n <= 10 ? "choice" : n <= 16 ? "fill" : n <= 24 ? "solution" : null)
      : year <= 2020
        ? (n <= 8 ? "choice" : n <= 14 ? "fill" : n <= 23 ? "solution" : null)
        : (n <= 10 ? "choice" : n <= 16 ? "fill" : n <= 22 ? "solution" : null);
  if (expectedType !== type) continue;
  const dedupeKey = `${year}|${n}`;
  if (seen.has(dedupeKey)) continue;
  seen.add(dedupeKey);
  let stemText = String(rawStem);
  let embeddedAnswer = "";
  const am = stemText.match(/\*{0,2}答案[:：]?\*{0,2}\s*([^\n]+)/);
  if (am) {
    embeddedAnswer = am[1].replace(/[（(]?\s*([A-D])\s*[）)]?/, "$1").trim();
    stemText = stemText.replace(am[0], "").replace(/\n>\s*$/, "").trim();
  }
  const { stem, options } = extractOptions(stemText);
  const chapter = classify(stem);
  let answer = normalizeAnswer(type, rawAnswer) || embeddedAnswer;
  if (!answer) {
    const exp = String(rawExplanation || "");
    const m = exp.match(/(?:故|因此|所以|应选|故选|答案为|选择)\s*[（(]?\s*([A-D])\s*[）)]?/);
    answer = m ? m[1] : "见解析";
  }
  const score = type === "solution" ? 10 : 5;
  questions.push({
    id: `math2-${year}-${String(number).padStart(2, "0")}`,
    subject: "math2",
    year,
    number: Number(number),
    type,
    score,
    chapter,
    topic: chapter.split(" · ")[1] || chapter,
    stem,
    options,
    answer,
    explanation: String(rawExplanation || "").trim(),
    source: "gtqbhksl/22408 数二真题整理（1987—2026）",
  });
}

questions.sort((a, b) => a.year - b.year || a.number - b.number);

// Write bank
fs.mkdirSync(path.dirname(OUT_BANK), { recursive: true });
const meta = {
  subject: "math2",
  name: "数学（二）",
  source: "gtqbhksl/22408 · 1987—2026 数二真题整理",
  years: [...new Set(questions.map(q => q.year))].sort(),
  count: questions.length,
  note: "题干和解析为开源题库整理，含公式 LaTeX；个别年份为回忆版，仅供练习。",
};
fs.writeFileSync(OUT_BANK, JSON.stringify({ meta, questions }));

// Write corpus markdown
fs.mkdirSync(OUT_CORPUS, { recursive: true });
const typeLabel = { choice: "选择题", fill: "填空题", solution: "解答题" };
const byYear = new Map();
for (const q of questions) {
  if (!byYear.has(q.year)) byYear.set(q.year, []);
  byYear.get(q.year).push(q);
}
for (const [year, qs] of byYear) {
  const lines = [];
  lines.push("---");
  lines.push("subject: math2");
  lines.push(`year: ${year}`);
  lines.push("source: gtqbhksl/22408");
  lines.push("quality: 开源整理，含回忆版");
  lines.push("---");
  lines.push("");
  lines.push(`# ${year} 年全国硕士研究生招生考试 数学（二）`);
  lines.push("");
  lines.push("> 科目代码 302 · 满分 150 分 · 考试时间 180 分钟");
  lines.push("");
  const groups = ["choice", "fill", "solution"]
    .filter(g => qs.some(q => q.type === g))
    .sort((a, b) => Math.min(...qs.filter(q => q.type === a).map(q => q.number)) - Math.min(...qs.filter(q => q.type === b).map(q => q.number)));
  for (const g of groups) {
    const list = qs.filter(q => q.type === g);
    if (!list.length) continue;
    lines.push(`## ${typeLabel[g]}`);
    lines.push("");
    for (const q of list) {
      lines.push(`### ${q.number}.`);
      lines.push("");
      lines.push(q.stem);
      lines.push("");
      if (q.options.length) {
        for (const o of q.options) lines.push(`- ${o.key}. ${o.text}`);
        lines.push("");
      }
    }
  }
  lines.push("---");
  lines.push("");
  lines.push("## 参考答案与解析");
  lines.push("");
  for (const q of qs) {
    lines.push(`### ${q.number}. 答案：${q.answer}`);
    lines.push("");
    if (q.explanation) lines.push(q.explanation);
    lines.push("");
  }
  fs.writeFileSync(path.join(OUT_CORPUS, `${year}.md`), lines.join("\n"));
}

const index = [
  "# 数学（二）真题库",
  "",
  `共 ${questions.length} 题，覆盖 ${meta.years[0]}—${meta.years[meta.years.length - 1]} 年。`,
  "",
  "| 年份 | 题量 | 文件 |",
  "| --- | --- | --- |",
  ...[...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([y, qs]) => `| ${y} | ${qs.length} | [${y}.md](./${y}.md) |`),
  "",
  "> 来源：gtqbhksl/22408（公开 GitHub 题库整理），仅用于个人学习。",
  "",
].join("\n");
fs.writeFileSync(path.join(OUT_CORPUS, "index.md"), index);

console.log(`math2: ${questions.length} questions, ${byYear.size} years`);
const dist = {};
for (const q of questions) dist[q.chapter] = (dist[q.chapter] || 0) + 1;
console.log(dist);
