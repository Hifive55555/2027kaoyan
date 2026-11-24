import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getMatchState } from "@/lib/match";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "请先登录" }, { status: 401 });
  const matchId = req.nextUrl.searchParams.get("matchId") || "";
  if (!matchId) return Response.json({ error: "缺少 matchId" }, { status: 400 });
  try {
    return Response.json(getMatchState(matchId, session));
  } catch (err) {
    const message = err instanceof Error ? err.message : "读取比赛失败";
    return Response.json({ error: message }, { status: message.includes("不存在") || message.includes("不在") ? 404 : 500 });
  }
}
