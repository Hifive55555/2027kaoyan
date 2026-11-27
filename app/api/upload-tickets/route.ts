import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { createUploadTicket, getQuestion, getTutorConversation } from "@/lib/queries";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserApi();
    if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const conversationId = String(body.conversationId || "");
    if (conversationId) {
      const conversation = getTutorConversation(auth.userId, conversationId);
      if (!conversation) return Response.json({ error: "对话不存在" }, { status: 404 });
      const ticket = createUploadTicket(auth.userId, `tutor:${conversationId}`);
      return Response.json({ ...ticket, conversationId });
    }
    const questionId = String(body.questionId || "");
    if (!questionId) return Response.json({ error: "缺少题目" }, { status: 400 });
    const question = getQuestion(questionId);
    if (!question || question.paperUserId !== auth.userId) {
      return Response.json({ error: "题目不存在" }, { status: 404 });
    }
    const ticket = createUploadTicket(auth.userId, questionId);
    return Response.json({ ...ticket, questionId });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "生成二维码失败" }, { status: 500 });
  }
}
