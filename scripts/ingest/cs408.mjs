import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const ROOT = path.resolve(import.meta.dirname, "../..");
const RAW = process.env.RAW_DIR || path.join(ROOT, "data/raw");
const OUT_BANK = path.join(ROOT, "data/bank/cs408.json");
const OUT_CORPUS = path.join(ROOT, "data/corpus/cs408");

const SUBJECT_LABEL = {
  "data-structure": "数据结构",
  "computer-organization": "计算机组成原理",
  "operating-system": "操作系统",
  "computer-network": "计算机网络",
};

const CHAPTER_RULES = {
  "data-structure": [
    ["线性表", ["线性表", "顺序表", "单链表", "双链表", "循环链表", "链表"]],
    ["栈、队列和数组", ["栈", "队列", "数组", "压缩存储", "矩阵"]],
    ["树与二叉树", ["二叉树", "树", "森林", "哈夫曼", "并查集", "堆", "叶结点", "结点"]],
    ["图", ["图", "顶点", "邻接", "最小生成树", "最短路径", "拓扑", "关键路径", "有向边"]],
    ["查找", ["查找", "折半", "二叉搜索树", "平衡二叉树", "红黑树", "B树", "B+树", "散列", "Hash", "哈希", "串"]],
    ["排序", ["排序", "插入", "起泡", "冒泡", "选择", "希尔", "快速", "归并", "基数", "外部排序"]],
  ],
  "computer-organization": [
    ["计算机系统概述", ["层次结构", "性能指标", "CPI", "MIPS", "MFLOPS", "计算机系统"]],
    ["数据的表示和运算", ["补码", "浮点", "IEEE 754", "定点", "运算器", "ALU", "溢出", "机器数", "编码"]],
    ["存储系统", ["Cache", "主存", "DRAM", "SRAM", "虚拟存储", "TLB", "页表", "磁盘", "SSD", "存储器", "内存"]],
    ["指令系统", ["指令", "寻址", "CISC", "RISC", "汇编", "操作码"]],
    ["中央处理器", ["CPU", "数据通路", "流水线", "控制器", "异常", "中断", "寄存器"]],
    ["总线", ["总线", "总线带宽", "总线仲裁"]],
    ["输入输出系统", ["I/O", "DMA", "设备", "驱动程序", "中断"]],
  ],
  "operating-system": [
    ["操作系统概述", ["操作系统", "内核", "系统调用", "虚拟机", "用户态", "内核态"]],
    ["进程管理", ["进程", "线程", "调度", "同步", "互斥", "信号量", "死锁", "PV", "管程", "临界区"]],
    ["内存管理", ["内存", "页", "段", "虚拟", "页面置换", "缺页", "地址转换"]],
    ["文件管理", ["文件", "目录", "索引", "磁盘", "FAT", "inode"]],
    ["输入输出管理", ["I/O", "设备", "缓冲区", "驱动", "SPOOLing"]],
  ],
  "computer-network": [
    ["计算机网络体系结构", ["分层", "OSI", "TCP/IP", "协议", "体系结构"]],
    ["物理层", ["物理层", "编码", "调制", "信道", "奈奎斯特", "香农", "带宽"]],
    ["数据链路层", ["链路", "帧", "以太网", "CSMA", "交换机", "VLAN", "差错", "MAC"]],
    ["网络层", ["IP", "路由", "子网", "CIDR", "ARP", "ICMP", "OSPF", "BGP", "网络层"]],
    ["传输层", ["TCP", "UDP", "拥塞", "流量控制", "端口", "传输层"]],
    ["应用层", ["DNS", "HTTP", "FTP", "SMTP", "应用层", "万维网"]],
  ],
};

function classify(subject, text, isComprehensive) {
  if (isComprehensive) return `${SUBJECT_LABEL[subject]} · 综合应用`;
  const rules = CHAPTER_RULES[subject] || [];
  for (const [chapter, words] of rules) {
    if (words.some(w => text.includes(w))) return `${SUBJECT_LABEL[subject]} · ${chapter}`;
  }
  return SUBJECT_LABEL[subject];
}

function cleanText(s) {
  return String(s || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mdFromNode($, node, ctx = {}) {
  if (!node) return "";
  if (node.type === "text") return node.data.replace(/\s+/g, " ");
  if (node.type !== "tag") return "";
  const name = node.name;
  const cls = ($(node).attr("class") || "").split(/\s+/);
  if (cls.includes("katex-mathml")) return "";
  if (cls.includes("katex")) {
    return $(node).text().replace(/\s+/g, "");
  }
  if (name === "img") {
    const src = $(node).attr("src") || "";
    if (!src) return "\n\n（题图见原卷）\n\n";
    if (!/^https?:/i.test(src)) return "\n\n（题图见原卷）\n\n";
    return `\n\n![题图](${src})\n\n`;
  }
  if (name === "br") return "\n";
  if (name === "pre") {
    const code = $(node).text().replace(/\n{3,}/g, "\n\n").trim();
    return `\n\n\`\`\`\n${code}\n\`\`\`\n\n`;
  }
  if (name === "code") {
    if ($(node).parents("pre").length) return $(node).text();
    return `\`${$(node).text()}\``;
  }
  if (name === "table") {
    const rows = [];
    $(node).find("tr").each((_, tr) => {
      const cells = [];
      $(tr).find("th,td").each((_, td) => cells.push($(td).text().replace(/\s+/g, " ").trim()));
      if (cells.length) rows.push(cells);
    });
    if (!rows.length) return "";
    const width = Math.max(...rows.map(r => r.length));
    const pad = r => [...r, ...Array(width - r.length).fill("")];
    const lines = [`| ${pad(rows[0]).join(" | ")} |`, `| ${Array(width).fill("---").join(" | ")} |`];
    for (const r of rows.slice(1)) lines.push(`| ${pad(r).join(" | ")} |`);
    return `\n\n${lines.join("\n")}\n\n`;
  }
  if (name === "sup") return `^{${$(node).text().trim()}}`;
  if (name === "sub") return `_{${$(node).text().trim()}}`;
  if (name === "strong" || name === "b") return `**${$(node).text().trim()}**`;
  if (name === "em" || name === "i") return `*${$(node).text().trim()}*`;
  if (name === "li") return `\n- ${$(node).text().trim()}`;
  if (name === "p" || name === "div" || name === "h1" || name === "h2" || name === "h3" || name === "h4") {
    const inner = node.children.map(c => mdFromNode($, c, ctx)).join("");
    if (name.startsWith("h")) return `\n\n${"#".repeat(Number(name[1]))} ${$(node).text().trim()}\n\n`;
    return `\n\n${inner.trim()}\n\n`;
  }
  return node.children.map(c => mdFromNode($, c, ctx)).join("");
}

function htmlToMarkdown(html) {
  const $ = cheerio.load(`<div id="__root">${html || ""}</div>`, { decodeEntities: true });
  const $root = $("#__root");
  const $content = $root.find(".content").first();
  const nodes = $content.length ? $content.children() : $root.children();
  const out = nodes.map((_, el) => mdFromNode($, el)).get().join("");
  return cleanText(out.replace(/[ ]{2,}/g, " "));
}

function parseQuestion(html) {
  const $ = cheerio.load(`<div id="__root">${html || ""}</div>`, { decodeEntities: true });
  const root = $("#__root");
  const content = root.find(".content").first();
  const scope = content.length ? content : root;
  const options = [];
  scope.find(".option").each((_, el) => {
    const key = $(el).find(".opt-label").text().replace(/[^A-D]/g, "").trim();
    const text = $(el).find(".opt-content").text().replace(/\s+/g, " ").trim();
    if (key) options.push({ key, text });
  });
  const clone = scope.clone();
  clone.find(".option").remove();
  const stem = cleanText(clone.children().map((_, el) => mdFromNode($, el)).get().join(""));
  return { stem, options };
}

// 2009-2025
const raw = fs.readFileSync(path.join(RAW, "cs408-questions_data.js"), "utf8");
const arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
const questions = [];
for (const q of arr) {
  const subject = q.subject;
  const isComp = q.type !== 1;
  const { stem, options } = parseQuestion(q.question);
  const explanation = htmlToMarkdown(q.analysisHtml || "");
  const chapter = classify(subject, stem, isComp);
  questions.push({
    id: `cs408-${q.year}-${String(q.index).padStart(2, "0")}`,
    subject: "cs408",
    year: q.year,
    number: q.index,
    type: isComp ? "comprehensive" : "choice",
    score: q.score || (isComp ? 10 : 2),
    chapter,
    topic: chapter.split(" · ")[1] || chapter,
    stem,
    options,
    answer: String(q.answer || "").trim(),
    explanation,
    source: "gtqbhksl/22408 408 真题整理（2009—2025）",
  });
}

// 2026 paper + details
const paperText = fs.readFileSync(path.join(RAW, "cs408-2026-paper.txt"), "utf8")
  .replace(/2026 年全国硕士研究生入学统一考试计算机学科专业基础综合试题 第 \d+ 页（共 \d+ 页）/g, "")
  .replace(/2026 年全国硕士研究生入学统一考试/g, "")
  .replace(/\n{3,}/g, "\n\n");

const starts = [];
const re = /^\s*(\d{1,2})\.\s*/gm;
let m;
while ((m = re.exec(paperText))) {
  const n = Number(m[1]);
  if (n >= 1 && n <= 47) starts.push({ n, idx: m.index });
}
const detailText = fs.readFileSync(path.join(RAW, "cs408-2026-details.txt"), "utf8");
const detailBlocks = new Map();
const dre = /第\s*(\d{1,2})\s*题/g;
const dstarts = [];
while ((m = dre.exec(detailText))) dstarts.push({ n: Number(m[1]), idx: m.index });
for (let i = 0; i < dstarts.length; i++) {
  const { n, idx } = dstarts[i];
  detailBlocks.set(n, detailText.slice(idx, dstarts[i + 1]?.idx ?? detailText.length));
}

function subjectOf(n) {
  if (n >= 41) {
    if (n <= 42) return "data-structure";
    if (n <= 44) return "computer-organization";
    if (n <= 46) return "operating-system";
    return "computer-network";
  }
  if (n <= 11) return "data-structure";
  if (n <= 22) return "computer-organization";
  if (n <= 32) return "operating-system";
  return "computer-network";
}
const SCORE_2026 = { 41: 13, 42: 10, 43: 10, 44: 13, 45: 7, 46: 8, 47: 9 };

for (let i = 0; i < starts.length; i++) {
  const { n, idx } = starts[i];
  const block = paperText.slice(idx, starts[i + 1]?.idx ?? paperText.length).replace(/^\s*\d{1,2}\.\s*/, "").trim();
  const isComp = n >= 41;
  const subject = subjectOf(n);
  let stem = block;
  let options = [];
  let answer = "";
  let explanation = "";
  if (!isComp) {
    const optMatch = block.match(/\n\s*A\.\s/);
    const stemEnd = optMatch ? optMatch.index : block.length;
    stem = block.slice(0, stemEnd).trim();
    const optText = block.slice(stemEnd).trim();
    const ores = [...optText.matchAll(/^\s*([A-D])\.\s*([\s\S]*?)(?=^\s*[A-D]\.\s|$)/gm)];
    options = ores.map(o => ({ key: o[1], text: o[2].replace(/\s+/g, " ").trim() }));
  }
  const db = detailBlocks.get(n) || "";
  const ansM = db.match(/【答案】\s*([A-D])/);
  if (ansM) answer = ansM[1];
  const expM = db.match(/【解】([\s\S]*)$/);
  if (expM) explanation = cleanText(expM[1]);
  const chapter = classify(subject, stem, isComp);
  questions.push({
    id: `cs408-2026-${String(n).padStart(2, "0")}`,
    subject: "cs408",
    year: 2026,
    number: n,
    type: isComp ? "comprehensive" : "choice",
    score: isComp ? (SCORE_2026[n] || 10) : 2,
    chapter,
    topic: chapter.split(" · ")[1] || chapter,
    stem: cleanText(stem),
    options,
    answer,
    explanation,
    source: "neville-studio/408-exam-paper + CHNragdoll 答案详解",
  });
}

questions.sort((a, b) => a.year - b.year || a.number - b.number);

fs.mkdirSync(path.dirname(OUT_BANK), { recursive: true });
const meta = {
  subject: "cs408",
  name: "计算机学科专业基础（408）",
  source: "gtqbhksl/22408（2009—2025）+ neville-studio/408-exam-paper（2026）",
  years: [...new Set(questions.map(q => q.year))].sort(),
  count: questions.length,
  note: "408 自 2009 年开考；2026 年答案来自公开答案详解。",
};
fs.writeFileSync(OUT_BANK, JSON.stringify({ meta, questions }));

// corpus
fs.mkdirSync(OUT_CORPUS, { recursive: true });
const byYear = new Map();
for (const q of questions) {
  if (!byYear.has(q.year)) byYear.set(q.year, []);
  byYear.get(q.year).push(q);
}
const typeLabel = { choice: "一、单项选择题", comprehensive: "二、综合应用题" };
for (const [year, qs] of byYear) {
  const lines = ["---", "subject: cs408", `year: ${year}`, "source: 公开真题库", "quality: 公开答案 + 解析", "---", ""];
  lines.push(`# ${year} 年全国硕士研究生招生考试 计算机学科专业基础（408）`);
  lines.push("");
  lines.push("> 满分 150 分 · 考试时间 180 分钟 · 数据结构 45 / 计组 45 / 操作系统 35 / 网络 25");
  lines.push("");
  for (const type of ["choice", "comprehensive"]) {
    const list = qs.filter(q => q.type === type);
    if (!list.length) continue;
    lines.push(`## ${typeLabel[type]}`);
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
    lines.push(`### ${q.number}. 答案：${q.answer || "见解析"}`);
    lines.push("");
    if (q.explanation) lines.push(q.explanation);
    lines.push("");
  }
  fs.writeFileSync(path.join(OUT_CORPUS, `${year}.md`), lines.join("\n"));
}
const index = ["---", "subject: cs408", "---", "", "# 408 真题库", "", `共 ${questions.length} 题，覆盖 2009—2026 年（408 自 2009 年开考）。`, "", "| 年份 | 选择题 | 综合题 | 文件 |", "| --- | --- | --- | --- |",
  ...[...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([y, qs]) => `| ${y} | ${qs.filter(q => q.type === "choice").length} | ${qs.filter(q => q.type === "comprehensive").length} | [${y}.md](./${y}.md) |`),
  "", "> 仅用于个人学习；部分题图未随文本保存，可参考原卷。", ""].join("\n");
fs.writeFileSync(path.join(OUT_CORPUS, "index.md"), index);

console.log(`cs408: ${questions.length} questions, ${byYear.size} years`);
const dist = {};
for (const q of questions) dist[q.chapter] = (dist[q.chapter] || 0) + 1;
console.log(dist);
