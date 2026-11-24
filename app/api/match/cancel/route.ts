import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { cancelMatch } from "@/lib/match";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const body = await req.json();
    const matchId = String(body.matchId || "");
    if (!matchId) return Response.json({ error: "缺少参数" }, { status: 400 });
    cancelMatch(matchId, session);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "取消失败" }, { status: 500 });
  }
}
