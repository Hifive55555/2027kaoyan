import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { updateTutorConversation } from "@/lib/queries";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUserApi();
  if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const input: { title?: string; archived?: boolean } = {};
  if (typeof body.title === "string") input.title = body.title;
  if (typeof body.archived === "boolean") input.archived = body.archived;
  const conversation = updateTutorConversation(auth.userId, id, input);
  if (!conversation) return Response.json({ error: "对话不存在" }, { status: 404 });
  return Response.json({ conversation });
}
