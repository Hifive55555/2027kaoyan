import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { getTutorQuizRaw, saveTutorQuizAttempt, getTutorQuiz, saveTutorMessage, getTutorConversation, getTutorConversationForQuiz, getOrCreateActiveTutorConversation, getAnswerContext } from "@/lib/queries";
import { buildQuizAnswerEvent } from "@/lib/tutor-events";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUserApi();
    if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
    const { id } = await ctx.params;
    const quiz = getTutorQuizRaw(id, auth.userId);
    if (!quiz) return Response.json({ error: "题目不存在" }, { status: 404 });
    if (quiz.attempt) {
      return Response.json({ correct: quiz.attempt.correct, quiz });
    }
    const body = await req.json().catch(() => ({}));
    const answer = String(body.answer || "").trim().toUpperCase().slice(0, 4);
    if (!answer) return Response.json({ error: "请选择一个答案" }, { status: 400 });
    const correct = answer === String(quiz.answer).trim().toUpperCase();
    saveTutorQuizAttempt(auth.userId, id, answer, correct);
    const conversationId = getTutorConversationForQuiz(auth.userId, id) || getOrCreateActiveTutorConversation(auth.userId).id;
    if (getTutorConversation(auth.userId, conversationId)?.archivedAt) return Response.json({ error: "对话已归档，请先取消归档" }, { status: 409 });
    const { chip, event } = buildQuizAnswerEvent({
      quiz,
      answer,
      correct,
      context: getAnswerContext(auth.userId, conversationId, { quizId: id }),
    });
    const systemMessage = saveTutorMessage(
      auth.userId,
      conversationId,
      "system",
      chip,
      undefined,
      undefined,
      { eventJson: event },
    );
    return Response.json({ correct, quiz: getTutorQuiz(id, auth.userId), systemMessage });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "提交失败" }, { status: 500 });
  }
}
