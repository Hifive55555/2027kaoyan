import fs from "node:fs";
import path from "node:path";

export type KnowledgeKind = "note" | "sentence" | "vocab";

export interface KnowledgeEntry {
  id: string;
  subject: "math2" | "english2" | "politics" | "cs408";
  chapter: string;
  title: string;
  text: string;
  source: string;
  sourceRepo?: string;
  sourceUrl?: string;
  kind: KnowledgeKind;
}

type KnowledgeFile = { meta?: Record<string, unknown>; questions?: KnowledgeEntry[]; entries?: KnowledgeEntry[] };

const KNOWLEDGE_DIR = path.join(process.cwd(), "data/knowledge");
declare global {
  var __beikaotaiKnowledge: Map<string, KnowledgeEntry[]> | undefined;
}

const FILES: { key: string; subject: KnowledgeEntry["subject"]; kind?: KnowledgeKind }[] = [
  { key: "math2", subject: "math2" },
  { key: "english2", subject: "english2" },
  { key: "english2-vocab", subject: "english2", kind: "vocab" },
  { key: "politics", subject: "politics" },
  { key: "cs408", subject: "cs408" },
];

function loadFile(key: string): KnowledgeEntry[] {
  if (!globalThis.__beikaotaiKnowledge) globalThis.__beikaotaiKnowledge = new Map();
  const cache = globalThis.__beikaotaiKnowledge;
  if (cache.has(key)) return cache.get(key)!;
  const file = path.join(KNOWLEDGE_DIR, `${key}.json`);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as KnowledgeFile;
    const list = (data.entries || data.questions || []).map(entry => ({
      ...entry,
      subject: entry.subject || FILES.find(f => f.key === key)?.subject || "cs408",
      kind: entry.kind || FILES.find(f => f.key === key)?.kind || "note",
    })) as KnowledgeEntry[];
    cache.set(key, list);
    return list;
  } catch {
    return [];
  }
}

export function allKnowledge(subject?: string, includeVocab = false): KnowledgeEntry[] {
  return FILES
    .filter(f => (!subject || f.subject === subject) && (includeVocab || f.key !== "english2-vocab"))
    .flatMap(f => loadFile(f.key));
}

export function knowledgeCounts(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of FILES) out[f.subject] = (out[f.subject] || 0) + loadFile(f.key).length;
  return out;
}

export function searchKnowledge(query: string, opts: { subject?: string; limit?: number; includeVocab?: boolean } = {}): KnowledgeEntry[] {
  const q = query.trim().toLowerCase();
  const terms = q.split(/\s+/).filter(x => x.length >= 2).slice(0, 8);
  const pool = allKnowledge(opts.subject, opts.includeVocab);
  if (!q) return pool.slice(0, opts.limit || 40);
  const scored = pool.map(entry => {
    const title = entry.title.toLowerCase();
    const chapter = entry.chapter.toLowerCase();
    const text = entry.text.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (title.includes(term)) score += 10;
      else if (chapter.includes(term)) score += 4;
      else if (text.includes(term)) score += 1;
    }
    // Chinese search: split the query into 2-4 character n-grams so a
    // phrase such as "缺页处理" can still find an entry whose title differs.
    if (terms.length === 1 && /[\u4e00-\u9fa5]/.test(q)) {
      for (let n = Math.min(4, q.length); n >= 2; n--) {
        for (let i = 0; i + n <= q.length; i++) {
          const gram = q.slice(i, i + n);
          if (title.includes(gram)) score += 6;
          else if (text.includes(gram)) score += 1;
        }
      }
    }
    return { entry, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, opts.limit || 40).map(x => x.entry);
}

export function listKnowledge(subject?: string, query = "", limit = 120): KnowledgeEntry[] {
  if (query.trim()) return searchKnowledge(query, { subject, limit, includeVocab: true });
  return allKnowledge(subject, true).slice(0, limit);
}

export function getKnowledgeEntry(id: string): KnowledgeEntry | null {
  for (const f of FILES) {
    const hit = loadFile(f.key).find(e => e.id === id);
    if (hit) return hit;
  }
  return null;
}

export function knowledgeExcerpt(subject: string | undefined, query: string, limit = 3, maxChars = 520): string {
  const hits = searchKnowledge(query, { subject, limit });
  return hits.map(e => `- [${e.chapter}] ${e.title}（${e.source}）\n${e.text.replace(/\s+/g, " ").slice(0, maxChars)}`).join("\n\n");
}
