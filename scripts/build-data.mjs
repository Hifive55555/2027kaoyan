import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const scripts = ["math2.mjs", "english2.mjs", "politics.mjs", "cs408.mjs"];
for (const s of scripts) {
  console.log(`\n▶ ${s}`);
  execFileSync(process.execPath, [path.join(ROOT, "scripts/ingest", s)], { stdio: "inherit", cwd: ROOT, env: process.env });
}

const manifest = { builtAt: new Date().toISOString(), subjects: {} };
for (const subject of ["math2", "english2", "politics", "cs408"]) {
  const bankFile = path.join(ROOT, "data/bank", `${subject}.json`);
  let meta = null;
  if (fs.existsSync(bankFile)) meta = JSON.parse(fs.readFileSync(bankFile, "utf8")).meta;
  const corpusDir = path.join(ROOT, "data/corpus", subject);
  const years = fs.existsSync(corpusDir)
    ? fs.readdirSync(corpusDir).filter(f => /^\d{4}\.md$/.test(f)).map(f => Number(f.slice(0, 4))).sort()
    : [];
  manifest.subjects[subject] = {
    years,
    count: meta?.count ?? null,
    source: meta?.source || (subject === "english2" ? "Echo1LZJY/echo-kaoyan-english-skill" : ""),
    note: meta?.note || "",
  };
}
fs.writeFileSync(path.join(ROOT, "data/corpus/manifest.json"), JSON.stringify(manifest, null, 2));
console.log("\n✓ manifest written", path.join(ROOT, "data/corpus/manifest.json"));
