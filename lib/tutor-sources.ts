import type { TutorSource, TutorSourceType } from "./types";

/**
 * Citation plumbing for the tutor: tools register the material they surface,
 * each entry gets an opaque ref ([[S1]]) that the model can cite in its reply.
 * Display numbers are assigned later, only for sources that were actually cited.
 */
export interface TutorSourceDraft {
  /** Stable identity used for dedupe across tool calls in one turn. */
  key: string;
  type: TutorSourceType;
  title: string;
  meta: string;
  excerpt: string;
  detail?: string;
  url?: string;
}

export interface TutorSourceCollector {
  add(draft: TutorSourceDraft): string;
  list(): TutorSource[];
  counts(): Partial<Record<TutorSourceType, number>>;
}

export function createTutorSourceCollector(): TutorSourceCollector {
  const byKey = new Map<string, TutorSource>();
  let seq = 0;
  return {
    add(draft) {
      const hit = byKey.get(draft.key);
      if (hit) return hit.ref;
      const ref = `S${++seq}`;
      byKey.set(draft.key, {
        ref,
        type: draft.type,
        title: draft.title,
        meta: draft.meta,
        excerpt: draft.excerpt,
        detail: draft.detail,
        url: draft.url,
      });
      return ref;
    },
    list() {
      return [...byKey.values()];
    },
    counts() {
      const out: Partial<Record<TutorSourceType, number>> = {};
      for (const source of byKey.values()) out[source.type] = (out[source.type] || 0) + 1;
      return out;
    },
  };
}

const MARKER = /\[\[(S\d+)\]\]/g;

/** Number the sources the reply actually cited, in order of first appearance. */
export function finalizeCitations(
  text: string,
  all: TutorSource[],
): { sources: TutorSource[]; uncited: number } {
  const known = new Map(all.map(source => [source.ref, source]));
  const used: string[] = [];
  for (const match of text.matchAll(MARKER)) {
    const ref = match[1];
    if (!known.has(ref) || used.includes(ref)) continue;
    used.push(ref);
  }
  const sources = used.map((ref, index) => ({ ...known.get(ref)!, num: index + 1 }));
  return { sources, uncited: Math.max(0, all.length - sources.length) };
}

/** Drop markers the model invented so they never reach the renderer. */
export function stripUnknownCitations(text: string, sources: TutorSource[]): string {
  const known = new Set(sources.map(source => source.ref));
  return text.replace(MARKER, (marker, ref: string) => (known.has(ref) ? marker : ""));
}
