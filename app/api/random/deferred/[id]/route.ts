import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { listDeferredRandomQuestions, removeDeferredRandomQuestion, takeDeferredRandomQuestion } from "@/lib/random";

export const runtime = "nodejs";

function itemsFor(userId: string) {
  const now = Date.now();
  return listDeferredRandomQuestions(userId).map(item => ({
    ...item,
    remainingMs: Math.max(0, new Date(item.dueAt).getTime() - now),
  }));
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUserApi();
  if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "resume");

  if (action === "remove") {
    removeDeferredRandomQuestion(auth.userId, id);
    return Response.json({ items: itemsFor(auth.userId) });
  }

  const question = takeDeferredRandomQuestion(auth.userId, { id });
  if (!question) {
    return Response.json(
      { error: "还没到恢复时间，或这条已不在队列里", items: itemsFor(auth.userId) },
      { status: 409 },
    );
  }
  return Response.json({ question, items: itemsFor(auth.userId) });
}
