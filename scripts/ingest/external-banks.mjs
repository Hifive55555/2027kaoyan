import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";
import {
  ROOT, SOURCE_ROOT, copyAsset, copyRelativeAsset, ensureDir, htmlToMarkdown, imgMd,
  mapMathChapter, normalizeAnswer, questionId, splitInlineOptions, stripHtml, writeBank, cleanText,
} from "../lib/external-utils.mjs";

const BANK = path.join(ROOT, "data/bank");
const SUPPLEMENT = {
  cs408: [],
  math2: [],
};

function src(...parts) { return path.join(SOURCE_ROOT, ...parts); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function withImages(text, urls) {
  const body = cleanText(text);
  const imgs = urls.filter(Boolean).map(u => imgMd(u)).join("");
  return `${body}${imgs}`.trim();
}
function imageList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object") return Object.values(value).flat();
  return [value];
}

// ---------- 408 1000题（relax-1000） ----------
function importRelax() {
  const dir = src("relax-1000");
  if (!fs.existsSync(path.join(dir, "data/site.json"))) return;
  const site = readJson(path.join(dir, "data/site.json"));
  const parts = {
    1: ["数据结构", "ds"],
    2: ["计算机组成原理", "coa"],
    3: ["操作系统", "os"],
    4: ["计算机网络", "net"],
  };
  const out = [];
  for (const chapter of site.chapters || []) {
    const [base, tag] = parts[chapter.part] || ["408", "misc"];
    const chapterName = `${base} · ${chapter.title}`;
    let number = 0;
    for (const q of chapter.questions || []) {
      number++;
      const answer = normalizeAnswer(q.ans);
      if (!answer || !/^[A-D]+$/.test(answer)) continue;
      const options = Object.entries(q.opts || {}).map(([key, value]) => {
        const urls = imageList((q.opt_figs || {})[key]).map(f => copyAsset(path.resolve(dir, "assets", f), "relax"));
        return { key, text: withImages(value?.text || value?.html || "", urls) };
      }).filter(o => o.text);
      if (options.length < 2) continue;
      const stemImgs = imageList(q.stem_figs).map(f => copyAsset(path.resolve(dir, "assets", f), "relax"));
      const solImgs = imageList(q.sol_figs).map(f => copyAsset(path.resolve(dir, "assets", f), "relax"));
      const stem = withImages(q.stem_text || q.stem_html || "", stemImgs);
      if (!stem) continue;
      out.push({
        id: `relax-${tag}-${q.id}`,
        subject: "cs408",
        year: 0,
        number,
        type: answer.length > 1 ? "multiple" : "choice",
        score: 2,
        chapter: chapterName,
        topic: chapter.title,
        difficulty: "提高",
        stem,
        options,
        answer,
        explanation: withImages(q.expl_text || q.expl_html || "", solImgs),
        source: "408 1000题（relax-1000）",
        sourceUrl: "https://github.com/jlshdsdk/relax-1000",
      });
    }
  }
  SUPPLEMENT.cs408.push(...out);
  console.log(`relax-1000: ${out.length}`);
}

// ---------- 408 带学站章末习题 ----------
const QUIZ_REPOS = [
  {
    repo: "kaoyan-408-os", subject: "cs408", base: "操作系统", ns: "os",
    chapters: { ch1: "操作系统概述", ch2: "进程管理", ch3: "内存管理", ch4: "文件管理", ch5: "输入输出管理" },
  },
  {
    repo: "kaoyan-408-coa", subject: "cs408", base: "计算机组成原理", ns: "coa",
    chapters: { ch1: "计算机系统概述", ch2: "数据的表示和运算", ch3: "存储器层次结构", ch4: "指令系统", ch5: "中央处理器", ch6: "总线与输入输出系统", ch7: "总线与输入输出系统" },
  },
  {
    repo: "kaoyan-408-networks", subject: "cs408", base: "计算机网络", ns: "net",
    chapters: { ch1: "体系结构", ch2: "物理层", ch3: "数据链路层", ch4: "网络层", ch5: "传输层", ch6: "应用层" },
  },
];

function parseQuizOptions($, item, ctx = {}) {
  const choices = [];
  item.find("ol.options > li").each((i, el) => {
    choices.push({ key: String.fromCharCode(65 + i), text: htmlToMarkdown($(el).html() || "", { imageBase: ctx.pageDir, namespace: ctx.namespace }) });
  });
  if (choices.length >= 2) return choices;
  item.find("ul.choices > li").each((_, el) => {
    const t = htmlToMarkdown($(el).html() || "", { imageBase: ctx.pageDir, namespace: ctx.namespace });
    const m = t.match(/^([A-D])[.．、]\s*([\s\S]+)$/);
    if (m) choices.push({ key: m[1], text: m[2].trim() });
  });
  if (choices.length >= 2) return choices;
  item.find(".mono").each((_, el) => {
    const parsed = splitInlineOptions($(el).text());
    if (parsed) choices.push(...parsed);
  });
  return choices.filter(o => o.text);
}

function parseAnswerText($, item) {
  const text = item.find(".ans-body, .qa-body, .ans").text();
  const m = text.match(/答案\s*[:：]\s*([A-D]+)/i);
  return normalizeAnswer(m?.[1]);
}

function parseQuizStem($, item, ctx = {}) {
  const clone = item.clone();
  clone.find("details, .ans, .qa, .options, .choices, .mono, .q-head, .q-no, .q-src, script, style, nav").remove();
  const text = htmlToMarkdown(clone.html() || "", { imageBase: ctx.pageDir, namespace: ctx.namespace });
  return cleanText(text.replace(/^第\s*\d+\s*题\s*/, "").replace(/\s*【[^】]*】\s*/g, " "));
}

function import408Quizzes() {
  for (const cfg of QUIZ_REPOS) {
    const root = src(cfg.repo);
    if (!fs.existsSync(root)) continue;
    let count = 0;
    const files = fs.readdirSync(root).filter(d => /^ch\d+$/.test(d)).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    for (const dir of files) {
      const file = path.join(root, dir, "quiz.html");
      if (!fs.existsSync(file)) continue;
      const pageDir = path.dirname(file);
      const $ = cheerio.load(fs.readFileSync(file, "utf8"), { decodeEntities: true });
      const chapter = cfg.chapters[dir] || dir;
      let number = 0;
      $(".q, .q-item, .quiz-item").each((_, el) => {
        const item = $(el);
        // Skip nested matches and non-question wrappers.
        if (item.parents(".q, .q-item, .quiz-item").length) return;
        const answer = parseAnswerText($, item);
        if (!answer) return;
        const options = parseQuizOptions($, item, { pageDir, namespace: cfg.ns });
        if (options.length < 2) return;
        const stem = parseQuizStem($, item, { pageDir, namespace: cfg.ns });
        if (!stem) return;
        const answerNode = item.find(".ans-body, .qa-body, .ans").clone();
        answerNode.find(".answer-tag, .ans-letter, .ans-key, summary").remove();
        const explanation = htmlToMarkdown(answerNode.html() || "", { imageBase: pageDir, namespace: cfg.ns });
        number++;
        count++;
        SUPPLEMENT.cs408.push({
          id: `${cfg.ns}-${dir}-${questionId("q", file + number)}`,
          subject: "cs408",
          year: 0,
          number,
          type: answer.length > 1 ? "multiple" : "choice",
          score: 2,
          chapter: `${cfg.base} · ${chapter}`,
          topic: chapter,
          difficulty: "提高",
          stem,
          options,
          answer,
          explanation,
          source: `408 ${cfg.base}带学站（${cfg.repo}）`,
          sourceUrl: `https://github.com/jlshdsdk/${cfg.repo}`,
        });
      });
    }
    console.log(`${cfg.repo}: ${count}`);
  }
}

// ---------- 三大计算（sanda-jisuan） ----------
function importSanda() {
  const dir = src("sanda-jisuan");
  if (!fs.existsSync(path.join(dir, "data/ch1.json"))) return;
  const out = [];
  for (const f of ["ch1.json", "ch2.json", "ch3.json"]) {
    const data = readJson(path.join(dir, "data", f));
    for (const section of data.sections || []) {
      let number = 0;
      for (const p of section.problems || []) {
        number++;
        const stem = cleanText(p.stem || "");
        if (!stem) continue;
        const image = typeof p.image === "string" ? copyAsset(path.join(dir, "docs/images", p.image), "sanda") : "";
        const answer = cleanText(p.answer || "");
        if (!answer) continue;
        out.push({
          id: `sanda-${p.id.replace(/[^\w\u4e00-\u9fa5-]+/g, "-")}`,
          subject: "math2",
          year: 0,
          number,
          type: "solution",
          score: 10,
          chapter: mapMathChapter(section.chapter_title || section.title),
          topic: section.title || section.chapter_title || "三大计算",
          difficulty: p.part || "基础",
          stem: withImages(stem, image ? [image] : []),
          options: [],
          answer,
          explanation: cleanText(p.solution || answer),
          source: "考研数学三大计算（sanda-jisuan）",
          sourceUrl: "https://github.com/jlshdsdk/sanda-jisuan",
        });
      }
    }
  }
  SUPPLEMENT.math2.push(...out);
  console.log(`sanda-jisuan: ${out.length}`);
}

// ---------- 张宇 1000 题（math1 source, filter to math2 chapters） ----------
const ZHANGYU_SKIP = /概率|随机|统计|大数|参数估计|假设检验|数字特征|期望|方差|分布|测试卷|无穷级数|多元函数积分学的预备知识|多元函数积分学|空间解析几何|曲线积分|曲面积分|三重积分|傅里叶|场论|伯努利方程与欧拉方程/;
function chapterFromZhangyu(title) {
  return mapMathChapter(title);
}
function importZhangyu() {
  const dir = src("zhangyu-1000t");
  if (!fs.existsSync(path.join(dir, "chapters"))) return;
  const out = [];
  const files = fs.readdirSync(path.join(dir, "chapters")).filter(f => /^chapter-\d+\.html$/.test(f));
  for (const f of files) {
    const file = path.join(dir, "chapters", f);
    const $ = cheerio.load(fs.readFileSync(file, "utf8"), { decodeEntities: true });
    const pageNo = Number((f.match(/\d+/) || [0])[0]);
    // 张宇 1000 题是数学一题源；26-31、59-71 是概率/测试卷，数二不考。
    if ((pageNo >= 26 && pageNo <= 31) || (pageNo >= 59 && pageNo <= 71)) continue;
    const topTitle = cleanText($(".top-title").text());
    const current = cleanText($(".toc-l3.cur").text()).replace(/^\d+\s*|\s*\d+题$/g, "").trim();
    const pageTitle = current || topTitle.replace(/（[^）]*）/g, "").replace(/^.*?·\s*/, "").trim();
    if (ZHANGYU_SKIP.test(pageTitle)) continue;
    let number = 0;
    $("article.question").each((_, el) => {
      const q = $(el);
      const kind = cleanText(q.find(".q-kind").text());
      const stemClone = q.find(".q-stem").clone();
      stemClone.find(".options").remove();
      const stem = htmlToMarkdown(stemClone.html() || "");
      if (!stem) return;
      const options = [];
      q.find(".options .opt").each((_, opt) => {
        const key = cleanText($(opt).find(".opt-key").text()).replace(/[^A-D]/g, "");
        const text = htmlToMarkdown($(opt).find(".opt-val").html() || "");
        if (key) options.push({ key, text });
      });
      let answer = cleanText(q.find(".answer-body").text());
      if (options.length) answer = normalizeAnswer(answer);
      if (!answer) return;
      const explanation = htmlToMarkdown(q.find(".analysis-body").html() || "");
      number++;
      out.push({
        id: `zhangyu-${f.replace(/[^\d]/g, "")}-${number}`,
        subject: "math2",
        year: 0,
        number,
        type: options.length ? "choice" : /填空/.test(kind) ? "fill" : "solution",
        score: /解答/.test(kind) ? 10 : 5,
        chapter: chapterFromZhangyu(pageTitle),
        topic: pageTitle,
        difficulty: topTitle.includes("强化") ? "提高" : "基础",
        stem,
        options,
        answer,
        explanation,
        source: "张宇考研数学1000题（math1 题源，按数二范围筛选）",
        sourceUrl: "https://github.com/jlshdsdk/zhangyu-1000t",
      });
    });
  }
  SUPPLEMENT.math2.push(...out);
  console.log(`zhangyu-1000t (math2 filtered): ${out.length}`);
}

// ---------- Kira 真题切片（图片题） ----------
function importKira() {
  const root = src("kira-past-papers");
  if (!fs.existsSync(path.join(root, "gs"))) return;
  let count = 0;
  for (const part of ["gs", "xd"]) {
    const partDir = path.join(root, part);
    const chapters = fs.readdirSync(partDir).filter(d => /^ch\d+$/.test(d)).sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
    for (const dir of chapters) {
      const file = path.join(partDir, dir, "index.html");
      if (!fs.existsSync(file)) continue;
      const pageDir = path.dirname(file);
      const $ = cheerio.load(fs.readFileSync(file, "utf8"), { decodeEntities: true });
      const title = cleanText($("h1.title").text()).replace(/^考点\s*\d+\s*/, "").trim();
      if (!title || /仅数一|仅数三|微分方程|经济学应用|差分方程/.test(title)) continue;
      let number = 0;
      $(".card.q").each((_, el) => {
        const card = $(el);
        const imgs = [];
        card.find("img.qimg").each((_, im) => {
          const src = $(im).attr("src") || "";
          const url = copyRelativeAsset(src, "kira", pageDir);
          if (url) imgs.push(url);
        });
        if (!imgs.length) return;
        const answers = [];
        card.find(".ans .ansline").each((_, el) => {
          const t = cleanText($(el).text());
          if (t) answers.push(t);
        });
        const steps = [];
        card.find(".ans .steps").each((_, el) => {
          const t = htmlToMarkdown($(el).html() || "");
          if (t) steps.push(t);
        });
        if (!answers.length) return;
        number++;
        count++;
        SUPPLEMENT.math2.push({
          id: `kira-${part}-${dir}-${card.attr("id") || number}`,
          subject: "math2",
          year: 0,
          number,
          type: "solution",
          score: 10,
          chapter: mapMathChapter(title),
          topic: title,
          difficulty: title.includes("专项") ? "提高" : "基础",
          stem: `【Kira 真题切片：${title}】\n\n${imgs.map((u, i) => imgMd(u, `Kira 题图 ${i + 1}`)).join("").trim()}`,
          options: [],
          answer: answers.join("\n\n"),
          explanation: steps.join("\n\n"),
          source: "Kira 考研数学真题切片集（题目图片）",
          sourceUrl: "https://github.com/jlshdsdk/kira-past-papers",
          imageOnly: true,
        });
      });
    }
  }
  console.log(`kira-past-papers: ${count}`);
}

function dedupe(list) {
  const seen = new Set();
  return list.filter(q => {
    const key = q.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function main() {
  if (!fs.existsSync(SOURCE_ROOT)) {
    console.error(`Missing sources at ${SOURCE_ROOT}. Run scripts/fetch-external.sh first.`);
    process.exit(1);
  }
  ensureDir(path.join(ROOT, "public/assets/external"));
  importRelax();
  import408Quizzes();
  importSanda();
  importZhangyu();
  importKira();
  const cs = dedupe(SUPPLEMENT.cs408);
  const math = dedupe(SUPPLEMENT.math2);
  writeBank(path.join(BANK, "cs408-external.json"), {
    subject: "cs408", name: "408 扩展题库", count: cs.length,
    source: "relax-1000 + kaoyan-408-os/coa/networks",
    note: "按 2027 大纲筛选的外部选择题；含题图，图片保存在 public/assets/external。",
    years: [0],
  }, cs);
  writeBank(path.join(BANK, "math2-external.json"), {
    subject: "math2", name: "数学（二）扩展题库", count: math.length,
    source: "sanda-jisuan + zhangyu-1000t（按数二筛选）+ kira-past-papers",
    note: "含解答题、填空题和图片题；kira 题组以原题图片保留，避免 OCR 丢图。",
    years: [0],
  }, math);
}

main();
