import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const RAW = process.env.RAW_DIR || path.join(ROOT, "data/raw");
const OUT_BANK = path.join(ROOT, "data/bank/politics.json");
const OUT_CORPUS = path.join(ROOT, "data/corpus/politics");

const SUBJECT_MAP = {
  "马原": "马克思主义基本原理",
  "毛中特": "毛泽东思想和中国特色社会主义理论体系概论",
  "新思想": "习近平新时代中国特色社会主义思想概论",
  "史纲": "中国近现代史纲要",
  "思法": "思想道德与法治",
  "时政": "形势与政策及当代世界经济与政治",
  "综合": "形势与政策及当代世界经济与政治",
};

function inferSubject2006(stem) {
  const s = stem;
  if (/(欧盟|禽流感|胡锦涛|温家宝|联合国|中东|俄罗斯|美国|日本|2005年|2006年|外交|上海合作组织|东盟)/.test(s)) return "时政";
  if (/(道德|法律|法治|宪法|权利|义务|诚信|理想|信念|人生观|价值观|公民)/.test(s)) return "思法";
  if (/(毛泽东|革命|抗战|辛亥|五四|遵义|长征|1840|1919|1921|1935|1945|1949|1956|1978|新中国成立|社会主义改造|太平天国|鸦片战争)/.test(s)) return "史纲";
  if (/(社会主义|改革|市场经济|邓小平|三个代表|科学发展观|现代化|对外开放|经济体制|政治体制|党的建设|统一战线|人民民主|依法治国|共同富裕|和谐社会)/.test(s)) return "毛中特";
  if (/(哲学|唯物|唯心|辩证法|认识|真理|矛盾|实践|资本|剩余价值|价值规律|商品|货币|生产|生产力|生产关系|社会存在|意识形态|人民群众|历史|劳动|阶级|垄断|帝国主义|发展)/.test(s)) return "马原";
  return "综合";
}

const MAP_2006 = {
  1:"马原",2:"马原",3:"马原",4:"马原",5:"马原",6:"马原",7:"毛中特",8:"毛中特",9:"毛中特",10:"毛中特",
  11:"毛中特",12:"毛中特",13:"毛中特",14:"时政",15:"时政",16:"时政",
  17:"马原",18:"马原",19:"马原",20:"马原",21:"马原",22:"马原",23:"毛中特",24:"毛中特",
  25:"史纲",26:"史纲",27:"史纲",28:"毛中特",29:"毛中特",30:"毛中特",31:"毛中特",32:"时政",33:"时政",
  34:"马原",35:"马原",36:"史纲",37:"毛中特",38:"时政",
};

function parse2006() {
  let t = fs.readFileSync(path.join(RAW, "politics-2006.txt"), "utf8");
  t = t.replace(/\u3000/g, " ").replace(/\r/g, "").replace(/[ \t]+/g, " ");
  const cut = t.indexOf("热门推荐");
  if (cut > 0) t = t.slice(0, cut);
  const s1 = t.indexOf("一、单项选择题"), s2 = t.indexOf("二、多项选择题"), s3 = t.indexOf("三、分析题");
  const sections = [
    ["single", t.slice(s1, s2), 1, 16],
    ["multiple", t.slice(s2, s3), 17, 33],
    ["analysis", t.slice(s3), 34, 38],
  ];
  const out = [];
  for (const [type, sec, from, to] of sections) {
    const re = /(?:^|\n)\s*(\d{1,2})\.\s*/g;
    const starts = [];
    let m;
    while ((m = re.exec(sec))) {
      const n = Number(m[1]);
      if (n >= from && n <= to) starts.push({ n, idx: m.index });
    }
    for (let i = 0; i < starts.length; i++) {
      const { n, idx } = starts[i];
      const block = sec.slice(idx, starts[i + 1]?.idx ?? sec.length);
      let body = block.replace(/^\s*\d{1,2}\.\s*/, "").trim();
      let answer = "";
      let ref = "";
      let explanation = "";
      let stem = body;
      if (type === "analysis") {
        const aIdx = body.indexOf("【答案要点】");
        const eIdx = body.indexOf("【解析】");
        if (aIdx >= 0) {
          stem = body.slice(0, aIdx).trim();
          const end = eIdx > aIdx ? eIdx : body.length;
          ref = body.slice(aIdx + "【答案要点】".length, end).replace(/^[.\s]*/, "").trim();
          if (eIdx > aIdx) explanation = body.slice(eIdx + "【解析】".length).trim();
        } else if (eIdx >= 0) {
          stem = body.slice(0, eIdx).trim();
          explanation = body.slice(eIdx + "【解析】".length).trim();
        }
      } else {
        const aIdx = body.indexOf("【答案】");
        const eIdx = body.indexOf("【解析】");
        if (aIdx >= 0) {
          stem = body.slice(0, aIdx).trim();
          const ansEnd = eIdx > aIdx ? eIdx : body.length;
          answer = body.slice(aIdx + "【答案】".length, ansEnd).replace(/[^A-D]/g, "").trim();
          if (eIdx > aIdx) explanation = body.slice(eIdx + "【解析】".length).trim();
        }
      }
      // options
      const options = {};
      const lines = stem.split("\n");
      const kept = [];
      let current = null;
      for (const rawLine of lines) {
        let line = rawLine.trim();
        if (!line) continue;
        // split inline A. B. C. D.
        if (/^[A-D][.、．]/.test(line)) {
          const parts = line.split(/(?=[A-D][.、．])/).filter(Boolean);
          for (const p of parts) {
            const mm = p.match(/^([A-D])[.、．]\s*(.*)$/);
            if (mm && !options[mm[1]]) { options[mm[1]] = mm[2].trim(); current = mm[1]; }
            else if (current) options[current] = (options[current] + " " + p).trim();
          }
        } else if (current && Object.keys(options).length < 4) {
          options[current] = (options[current] + " " + line).trim();
        } else {
          kept.push(line);
        }
      }
      stem = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
      const subject = MAP_2006[n] || inferSubject2006(stem);
      out.push({
        id: `politics-2006-${String(n).padStart(2, "0")}`,
        subject: "politics",
        year: 2006,
        number: n,
        type,
        score: type === "single" ? 1 : type === "multiple" ? 2 : 10,
        chapter: SUBJECT_MAP[subject] || SUBJECT_MAP["综合"],
        topic: subject,
        stem,
        options: Object.entries(options).sort().map(([k, v]) => ({ key: k, text: v })),
        answer: type === "analysis" ? "" : answer,
        explanation,
        referenceAnswer: ref,
        source: "新东方网 2006 年考研政治真题及答案详解",
      });
    }
  }
  return out;
}

const nishino = JSON.parse(fs.readFileSync(path.join(RAW, "politics.json"), "utf8"));
const questions = [];
for (const q of nishino.questions) {
  const chapter = SUBJECT_MAP[q.subject] || SUBJECT_MAP["综合"];
  const answer = Array.isArray(q.answer) ? q.answer.join("") : (q.answer || "");
  questions.push({
    id: `politics-${q.year}-${String(q.number).padStart(2, "0")}`,
    subject: "politics",
    year: q.year,
    number: q.number,
    type: q.type,
    score: q.type === "single" ? 1 : q.type === "multiple" ? 2 : 10,
    chapter,
    topic: q.topic || q.knowledgePoint || q.subject,
    stem: q.stem,
    options: q.options ? Object.entries(q.options).map(([k, v]) => ({ key: k, text: v })) : [],
    answer,
    explanation: q.explanation || "",
    referenceAnswer: q.referenceAnswer || "",
    source: "Nishino0525Nanase/kaoyan-politics（公开真题库）",
    sourceUrl: q.sourceUrl || "",
  });
}
questions.push(...parse2006());
questions.sort((a, b) => a.year - b.year || a.number - b.number);

fs.mkdirSync(path.dirname(OUT_BANK), { recursive: true });
const meta = {
  subject: "politics",
  name: "思想政治理论",
  source: "Nishino0525Nanase/kaoyan-politics + 新东方 2006 真题",
  years: [...new Set(questions.map(q => q.year))].sort(),
  count: questions.length,
  note: "选择题答案为公开参考答案；分析题提供参考要点，采用自评/AI 批改。",
};
fs.writeFileSync(OUT_BANK, JSON.stringify({ meta, questions }));

// markdown corpus
fs.mkdirSync(OUT_CORPUS, { recursive: true });
const byYear = new Map();
for (const q of questions) {
  if (!byYear.has(q.year)) byYear.set(q.year, []);
  byYear.get(q.year).push(q);
}
const typeLabel = { single: "一、单项选择题", multiple: "二、多项选择题", analysis: "三、材料分析题" };
for (const [year, qs] of byYear) {
  const lines = ["---", "subject: politics", `year: ${year}`, "source: 公开真题库 + 新东方", "quality: 公开参考答案", "---", ""];
  lines.push(`# ${year} 年全国硕士研究生招生考试 思想政治理论`);
  lines.push("");
  lines.push("> 科目代码 101 · 满分 100 分 · 考试时间 180 分钟");
  lines.push("");
  for (const type of ["single", "multiple", "analysis"]) {
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
    lines.push(`### ${q.number}.`);
    lines.push("");
    if (q.type === "analysis") {
      lines.push("**参考要点**");
      lines.push("");
      lines.push(q.referenceAnswer || "（略）");
      if (q.explanation) { lines.push(""); lines.push("**解析**"); lines.push(""); lines.push(q.explanation); }
    } else {
      lines.push(`**答案：${q.answer}**`);
      if (q.explanation) { lines.push(""); lines.push(q.explanation); }
    }
    lines.push("");
  }
  fs.writeFileSync(path.join(OUT_CORPUS, `${year}.md`), lines.join("\n"));
}

const index = ["---", "subject: politics", "---", "", "# 思想政治理论真题库", "", `共 ${questions.length} 题，覆盖 2006—2026 年。`, "", "| 年份 | 单选 | 多选 | 分析 | 文件 |", "| --- | --- | --- | --- | --- |",
  ...[...byYear.entries()].sort((a, b) => b[0] - a[0]).map(([y, qs]) => `| ${y} | ${qs.filter(q => q.type === "single").length} | ${qs.filter(q => q.type === "multiple").length} | ${qs.filter(q => q.type === "analysis").length} | [${y}.md](./${y}.md) |`),
  "", "> 仅用于个人学习。分析题参考要点为公开资料整理，非官方评分细则。", ""].join("\n");
fs.writeFileSync(path.join(OUT_CORPUS, "index.md"), index);

console.log(`politics: ${questions.length} questions, ${byYear.size} years`);
const d = {};
for (const q of questions) d[q.chapter] = (d[q.chapter] || 0) + 1;
console.log(d);
