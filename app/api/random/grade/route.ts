import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { gradeRandom } from "@/lib/random";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const auth = await requireUserApi();
  if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const body = await req.json();
    const questionId = String(body.questionId || "");
    const answer = String(body.answer || "");
    const dontKnow = body.dontKnow === true;
    if (!questionId || (!answer && !dontKnow)) return Response.json({ error: "缺少参数" }, { status: 400 });
    return Response.json(gradeRandom(auth.userId, questionId, answer, { dontKnow }));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "批改失败" }, { status: 500 });
  }
}
