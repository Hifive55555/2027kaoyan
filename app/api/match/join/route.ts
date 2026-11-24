import { getSession } from "@/lib/auth";
import { joinMatch } from "@/lib/match";

export const runtime = "nodejs";

export async function POST() {
  const session = await getSession();
  if (!session) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    return Response.json(joinMatch(session));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "匹配失败" }, { status: 500 });
  }
}
