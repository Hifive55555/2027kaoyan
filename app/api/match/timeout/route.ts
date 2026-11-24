import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { timeoutMatch } from "@/lib/match";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const body = await req.json();
    const matchId = String(body.matchId || "");
    if (!matchId) return Response.json({ error: "缺少参数" }, { status: 400 });
    return Response.json({ state: timeoutMatch(matchId, session) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "操作失败" }, { status: 500 });
  }
}
