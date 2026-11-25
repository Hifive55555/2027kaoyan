import fs from "node:fs";
import path from "node:path";

export interface ExternalQuestion {
  id: string;
  subject: "math2" | "cs408";
  year: number;
  number: number;
  type: string;
  score?: number;
  chapter: string;
  topic?: string;
  difficulty?: string;
  stem: string;
  options: { key: string; text: string }[];
  answer: string;
  explanation?: string;
  source?: string;
  sourceUrl?: string;
  imageOnly?: boolean;
}

interface ExternalBank {
  meta?: Record<string, unknown>;
  questions?: ExternalQuestion[];
}

declare global {
  var __beikaotaiExternalBanks: Map<string, ExternalQuestion[]> | undefined;
}

export function loadExternalBank(subject: "math2" | "cs408"): ExternalQuestion[] {
  if (!globalThis.__beikaotaiExternalBanks) globalThis.__beikaotaiExternalBanks = new Map();
  const cache = globalThis.__beikaotaiExternalBanks;
  if (cache.has(subject)) return cache.get(subject)!;
  const file = path.join(process.cwd(), "data/bank", `${subject}-external.json`);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8")) as ExternalBank;
    const list = (data.questions || []).filter(q => q.stem);
    cache.set(subject, list);
    return list;
  } catch {
    return [];
  }
}

export function searchExternalBank(subject: "math2" | "cs408", query: string, limit = 40): ExternalQuestion[] {
  const q = query.trim().toLowerCase();
  const list = loadExternalBank(subject);
  if (!q) return list.slice(0, limit);
  return list.filter(item => `${item.chapter} ${item.topic || ""} ${item.stem} ${item.source || ""}`.toLowerCase().includes(q)).slice(0, limit);
}
