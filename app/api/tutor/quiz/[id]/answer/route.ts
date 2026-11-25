import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { getTutorQuizRaw, saveTutorQuizAttempt, getTutorQuiz, saveTutorMessage } from "@/lib/queries";

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
    const label = quiz.topic || quiz.chapter || "巩固题";
    const systemMessage = saveTutorMessage(
      auth.userId,
      "system",
      `已完成巩固题「${label}」：选择 ${answer}，${correct ? "答对" : "答错"}。`
    );
    return Response.json({ correct, quiz: getTutorQuiz(id, auth.userId), systemMessage });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "提交失败" }, { status: 500 });
  }
}
