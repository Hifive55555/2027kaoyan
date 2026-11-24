import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { submitAnswer } from "@/lib/match";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const body = await req.json();
    const matchId = String(body.matchId || "");
    const idx = Number(body.idx);
    const answer = String(body.answer || "");
    if (!matchId || !Number.isInteger(idx)) return Response.json({ error: "缺少参数" }, { status: 400 });
    return Response.json(submitAnswer(matchId, session, idx, answer));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "提交失败" }, { status: 500 });
  }
}
