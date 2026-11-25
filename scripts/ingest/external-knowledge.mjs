import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import {
  ROOT, SOURCE_ROOT, cleanText, ensureDir, htmlToMarkdown, mapMathChapter, questionId, writeBank,
} from "../lib/external-utils.mjs";

const OUT = path.join(ROOT, "data/knowledge");
const entries = { cs408: [], math2: [], english2: [], "english2-vocab": [] };
const seen = new Set();

function src(...parts) { return path.join(SOURCE_ROOT, ...parts); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function repoUrl(repo, rel = "") {
  return `https://github.com/jlshdsdk/${repo}${rel ? `/blob/main/${rel}` : ""}`;
}
function add(bucket, entry) {
  const text = cleanText(entry.text || "", 12000);
  if (!text || text.length < 30) return;
  const id = entry.id || questionId("kn", `${entry.source || ""}|${entry.title}|${entry.sourceUrl || ""}`);
  const key = `${bucket}:${id}`;
  if (seen.has(key)) return;
  seen.add(key);
  entries[bucket].push({ ...entry, id, text });
}
function chapter408(title) {
  const t = String(title || "");
  if (/数据结构|线性表|栈|队列|数组|串|树|图|查找|排序/.test(t)) return "数据结构";
  if (/操作系统|进程|内存|文件|I\/O|输入\/输出/.test(t)) return "操作系统";
  if (/计算机组成|数据表示|运算|存储系统|指令系统|中央处理器|总线|输入输出/.test(t)) return "计算机组成原理";
  if (/计算机网络|体系结构|物理层|链路层|网络层|传输层|应用层/.test(t)) return "计算机网络";
  return "408";
}
function pageHtml(file, selector) {
  const $ = cheerio.load(fs.readFileSync(file, "utf8"), { decodeEntities: true });
  const node = selector ? $(selector).first() : $("main").first();
  return { $, node, title: cleanText($("h1").first().text() || $("title").text()) };
}

function import408Indexes() {
  const osFile = src("kaoyan-408-os/search-index.json");
  if (fs.existsSync(osFile)) {
    const list = readJson(osFile);
    for (const p of list) {
      if (!p.u || /quiz|index\.html|recall/.test(p.u)) continue;
      add("cs408", {
        subject: "cs408", chapter: chapter408(p.t), title: p.t.replace(/^第\d+章[·\s]*/, ""),
        source: "408 操作系统带学站", sourceRepo: "kaoyan-408-os", sourceUrl: repoUrl("kaoyan-408-os", p.u),
        kind: "note", text: p.x,
      });
    }
  }
  const coaFile = src("kaoyan-408-coa/search-index.json");
  if (fs.existsSync(coaFile)) {
    const list = readJson(coaFile);
    for (const p of list) {
      if (!p.u || /quiz|index\.html|recall/.test(p.u)) continue;
      add("cs408", {
        subject: "cs408", chapter: chapter408(p.t), title: p.t,
        source: "408 计算机组成原理带学站", sourceRepo: "kaoyan-408-coa", sourceUrl: repoUrl("kaoyan-408-coa", p.u),
        kind: "note", text: p.x,
      });
    }
  }
  const dsFile = src("data-structure-site/assets/search-index.json");
  if (fs.existsSync(dsFile)) {
    const data = readJson(dsFile);
    for (const page of Object.values(data.pages || {})) {
      for (const p of page.items || []) {
        add("cs408", {
          subject: "cs408", chapter: "数据结构", title: p.title,
          source: "王道数据结构同步精讲", sourceRepo: "data-structure-site", sourceUrl: repoUrl("data-structure-site", page.file),
          kind: "note", text: p.text,
        });
      }
    }
  }
}

function importNetworks() {
  const root = src("kaoyan-408-networks");
  if (!fs.existsSync(root)) return;
  for (const dir of fs.readdirSync(root).filter(d => /^ch\d+$/.test(d))) {
    for (const f of fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith(".html"))) {
      if (/quiz|index|recall/.test(f)) continue;
      const file = path.join(root, dir, f);
      const pageDir = path.dirname(file);
      const { node, title } = pageHtml(file, "main.content");
      if (!node.length) continue;
      const text = htmlToMarkdown(node.html() || "", { imageBase: pageDir, namespace: "knowledge-net" });
      add("cs408", {
        subject: "cs408", chapter: "计算机网络", title,
        source: "408 计算机网络带学站", sourceRepo: "kaoyan-408-networks",
        sourceUrl: repoUrl("kaoyan-408-networks", path.relative(root, file)),
        kind: "note", text,
      });
    }
  }
}

function importDsLessons() {
  const dir = src("kaoyan-408-ds/l");
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith(".html"))) {
    const file = path.join(dir, f);
    const pageDir = path.dirname(file);
    const { node, title } = pageHtml(file, "main.wrap.lesson");
    if (!node.length) continue;
    const text = htmlToMarkdown(node.html() || "", { imageBase: pageDir, namespace: "knowledge-ds" });
    add("cs408", {
      subject: "cs408", chapter: "数据结构", title,
      source: "408 数据结构动画/代码讲义", sourceRepo: "kaoyan-408-ds",
      sourceUrl: repoUrl("kaoyan-408-ds", `l/${f}`), kind: "note", text,
    });
  }
}

function importMath() {
  const zero = src("zhangyu-math-zero-basics");
  if (fs.existsSync(zero)) {
    for (const f of fs.readdirSync(zero).filter(f => f.endsWith(".html") && f !== "index.html")) {
      const file = path.join(zero, f);
      const pageDir = path.dirname(file);
      const { node, title } = pageHtml(file, "main .content");
      if (!node.length) continue;
      const text = htmlToMarkdown(node.html() || "", { imageBase: pageDir, namespace: "knowledge-math" });
      add("math2", {
        subject: "math2", chapter: mapMathChapter(title), title,
        source: "张宇数学基础30讲 · 零基础", sourceRepo: "zhangyu-math-zero-basics",
        sourceUrl: repoUrl("zhangyu-math-zero-basics", f), kind: "note", text,
      });
    }
  }
  const thirty = src("zhangyu-30jiang-selfstudy/lectures");
  if (fs.existsSync(thirty)) {
    for (const f of fs.readdirSync(thirty).filter(f => /^L\d+\.html$/.test(f))) {
      const file = path.join(thirty, f);
      const pageDir = path.dirname(file);
      const { node, title } = pageHtml(file, "main");
      if (!node.length) continue;
      const text = htmlToMarkdown(node.html() || "", { imageBase: pageDir, namespace: "knowledge-math" });
      add("math2", {
        subject: "math2", chapter: mapMathChapter(title), title,
        source: "张宇30讲 · 自学版", sourceRepo: "zhangyu-30jiang-selfstudy",
        sourceUrl: repoUrl("zhangyu-30jiang-selfstudy", `lectures/${f}`), kind: "note", text,
      });
    }
  }
}

function importSentences() {
  const root = src("english-sentences");
  if (!fs.existsSync(root)) return;
  for (const book of ["binbin66", "baiju100"]) {
    const dir = path.join(root, book);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter(f => /^p\d+\.html$/.test(f))) {
      const file = path.join(dir, f);
      const $ = cheerio.load(fs.readFileSync(file, "utf8"), { decodeEntities: true });
      $(".card").each((_, el) => {
        const card = $(el);
        const sentence = cleanText(card.find(".sentence").text());
        if (!sentence) return;
        const words = card.find(".words li").map((_, li) => `- ${cleanText($(li).text())}`).get().join("\n");
        const trunk = cleanText(card.find(".trunk").text());
        const analysis = card.find(".analysis li").map((_, li) => `- ${cleanText($(li).text())}`).get().join("\n");
        const trans = cleanText(card.find(".trans").text());
        const tags = card.find(".tags .tag").map((_, t) => cleanText($(t).text())).get().filter(Boolean).join(" / ");
        const text = `## 原句\n\n${sentence}\n\n${tags ? `**标签**：${tags}\n\n` : ""}## 生词\n\n${words || "（无）"}\n\n## 主干\n\n${trunk || "（无）"}\n\n## 解析\n\n${analysis || "（无）"}\n\n## 翻译\n\n${trans || "（无）"}`;
        add("english2", {
          subject: "english2", chapter: "长难句", title: sentence.slice(0, 70),
          source: book === "binbin66" ? "斌斌66句" : "Monkey百句实战", sourceRepo: "english-sentences",
          sourceUrl: repoUrl("english-sentences", `${book}/${f}`), kind: "sentence", text,
        });
      });
    }
  }
}

function importVocab() {
  const dir = src("kaoyan-vocab5/data");
  if (!fs.existsSync(dir)) return;
  const chunks = fs.readdirSync(dir).filter(f => /^c\d+\.json$/.test(f)).sort();
  for (const f of chunks) {
    const data = readJson(path.join(dir, f));
    for (const word of Object.values(data.words || {})) {
      if (!word?.w) continue;
      const senses = (word.senses || []).filter(Boolean).slice(0, 6).join("；");
      const phrases = (word.phrases || []).slice(0, 4).map(p => `- ${p.p}：${p.m}`).join("\n");
      const ex = (word.ex || [])[0];
      const text = `## ${word.w}\n\n${word.ph?.uk ? `**音标**：/${word.ph.uk}/\n\n` : ""}${senses ? `**释义**：${senses}\n\n` : ""}${phrases ? `**搭配**\n${phrases}\n\n` : ""}${ex ? `**例句**：${ex.en}\n\n${ex.zh || ""}\n\n` : ""}${word.usage ? `**提示**：${word.usage}` : ""}`;
      add("english2-vocab", {
        subject: "english2", chapter: "词汇", title: word.w, source: "考研词汇五书合一",
        sourceRepo: "kaoyan-vocab5", sourceUrl: repoUrl("kaoyan-vocab5", `data/${f}`), kind: "vocab", text,
      });
    }
  }
}

function main() {
  if (!fs.existsSync(SOURCE_ROOT)) {
    console.error(`Missing sources at ${SOURCE_ROOT}. Run scripts/fetch-external.sh first.`);
    process.exit(1);
  }
  ensureDir(OUT);
  import408Indexes();
  importNetworks();
  importDsLessons();
  importMath();
  importSentences();
  importVocab();
  const meta = {
    builtAt: new Date().toISOString(),
    sources: [
      "kaoyan-408-os", "kaoyan-408-coa", "kaoyan-408-networks", "data-structure-site",
      "zhangyu-math-zero-basics", "zhangyu-30jiang-selfstudy",
      "english-sentences", "kaoyan-vocab5",
    ],
    note: "知识点来自公开学习站；原文版权归原作者，个人学习用途。图片存放在 public/assets/external/knowledge-*。",
  };
  for (const [key, list] of Object.entries(entries)) {
    const file = path.join(OUT, `${key}.json`);
    ensureDir(OUT);
    fs.writeFileSync(file, JSON.stringify({ meta: { ...meta, subject: key, name: key === "english2-vocab" ? "英语词汇" : key, count: list.length }, entries: list }, null, 1));
    console.log(`  ${path.relative(ROOT, file)}: ${list.length} entries`);
  }
}

main();
