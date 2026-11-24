import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { getUploadTicketState } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const auth = await requireUserApi();
  if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
  const { token } = await ctx.params;
  const state = getUploadTicketState(token, auth.userId);
  if (!state) return Response.json({ error: "二维码不存在" }, { status: 404 });
  return Response.json(state, { headers: { "Cache-Control": "no-store" } });
}
