import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const bank = JSON.parse(fs.readFileSync(path.join(ROOT, "data/bank/math2.json"), "utf8"));
const OUT = path.join(ROOT, "data/raw/math2-chapters.json");
const KEY = process.env.DEEPSEEK_API_KEY;
if (!KEY) throw new Error("DEEPSEEK_API_KEY missing");

const CHAPTERS = [
  "高等数学 · 函数、极限、连续",
  "高等数学 · 一元函数微分学",
  "高等数学 · 一元函数积分学",
  "高等数学 · 多元函数微积分学",
  "高等数学 · 常微分方程",
  "线性代数 · 行列式",
  "线性代数 · 矩阵",
  "线性代数 · 向量",
  "线性代数 · 线性方程组",
  "线性代数 · 特征值与特征向量",
  "线性代数 · 二次型",
];

const existing = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const todo = bank.questions.filter(q => !existing[q.id]);

async function callBatch(batch) {
  const payload = batch.map(q => ({ id: q.id, text: q.stem.replace(/\n+/g, " ").slice(0, 420) }));
  const prompt = `你是考研数学二教研员。请为下面每道题标注一个最主要的考查章节。
只能从以下章节中选择（必须原样返回）：
${CHAPTERS.map(c => `- ${c}`).join("\n")}

题目：
${JSON.stringify(payload, null, 0)}

返回 JSON：{"labels": {"题目id": "章节名", ...}}。每题必须有标签，不要解释。`;
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: "deepseek-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 4000,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "{}";
  const parsed = JSON.parse(text);
  return parsed.labels || {};
}

const batches = [];
for (let i = 0; i < todo.length; i += 30) batches.push(todo.slice(i, i + 30));
console.log(`classifying ${todo.length} questions in ${batches.length} batches`);

let done = 0;
for (const batch of batches) {
  let labels = {};
  for (let attempt = 0; attempt < 3; attempt++) {
    try { labels = await callBatch(batch); break; }
    catch (e) { console.error("retry", attempt, e.message); await new Promise(r => setTimeout(r, 1500)); }
  }
  for (const q of batch) {
    const label = labels[q.id];
    existing[q.id] = CHAPTERS.includes(label) ? label : "高等数学 · 一元函数微分学";
  }
  done += batch.length;
  fs.writeFileSync(OUT, JSON.stringify(existing, null, 2));
  console.log(`progress ${done}/${todo.length}`);
}
console.log("done", Object.keys(existing).length);
