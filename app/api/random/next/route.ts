import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { nextRandomQuestion } from "@/lib/random";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireUserApi();
  if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
  try {
    const exclude = req.nextUrl.searchParams.get("exclude") || undefined;
    const question = await nextRandomQuestion(auth.userId, exclude);
    if (!question) return Response.json({ error: "题库为空" }, { status: 500 });
    return Response.json({ question });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "取题失败" }, { status: 500 });
  }
}
