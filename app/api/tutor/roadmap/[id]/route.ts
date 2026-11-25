import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { setTutorRoadmapStatus } from "@/lib/queries";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUserApi();
  if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const status = String(body.status || "");
  if (!["pending", "in_progress", "done"].includes(status)) {
    return Response.json({ error: "状态不合法" }, { status: 400 });
  }
  const roadmap = setTutorRoadmapStatus(auth.userId, id, status as "pending" | "in_progress" | "done");
  if (!roadmap) return Response.json({ error: "路线项不存在" }, { status: 404 });
  return Response.json({ roadmap });
}
