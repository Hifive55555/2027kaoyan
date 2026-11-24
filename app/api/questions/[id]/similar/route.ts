import { NextRequest } from "next/server";
import { generateSimilar } from "@/lib/similar";
import { getPaper } from "@/lib/queries";
import { requireUserApi } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 200;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUserApi();
    if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
    const { id } = await ctx.params;
    const result = await generateSimilar(id, auth.userId);
    const paper = getPaper(result.paperId, { userId: auth.userId });
    return Response.json({ ...result, paper });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "生成失败" }, { status: 500 });
  }
}
