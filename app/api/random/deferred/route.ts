import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { deferRandomQuestion, listDeferredRandomQuestions } from "@/lib/random";
import type { RandomQuestionPublic } from "@/lib/random-types";

export const runtime = "nodejs";

function withRemaining(items: ReturnType<typeof listDeferredRandomQuestions>) {
  const now = Date.now();
  return items.map(item => ({
    ...item,
    remainingMs: Math.max(0, new Date(item.dueAt).getTime() - now),
  }));
}

export async function GET() {
  const auth = await requireUserApi();
  if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json({ items: withRemaining(listDeferredRandomQuestions(auth.userId)) });
}

export async function POST(req: NextRequest) {
  const auth = await requireUserApi();
  if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const raw = body?.question;
    if (!raw || typeof raw !== "object" || !raw.id || !raw.stem || !Array.isArray(raw.options)) {
      return Response.json({ error: "缺少题目" }, { status: 400 });
    }
    const question: RandomQuestionPublic = {
      id: String(raw.id),
      subject: String(raw.subject || ""),
      subjectName: String(raw.subjectName || ""),
      year: Number(raw.year) || 0,
      number: Number(raw.number) || 0,
      type: String(raw.type || "choice"),
      chapter: String(raw.chapter || ""),
      topic: String(raw.topic || ""),
      difficulty: String(raw.difficulty || ""),
      stem: String(raw.stem),
      options: raw.options.slice(0, 6).map((option: { key?: unknown; text?: unknown }) => ({
        key: String(option?.key || ""),
        text: String(option?.text || ""),
      })),
      generated: raw.generated === true || undefined,
    };
    const items = deferRandomQuestion(auth.userId, question);
    return Response.json({ items: withRemaining(items) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "加入队列失败" }, { status: 500 });
  }
}
