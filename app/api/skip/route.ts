import { NextRequest } from "next/server";
import { getQuestion, saveAttempt } from "@/lib/queries";
import { requireUserApi } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserApi();
    if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
    const body = await req.json();
    const questionId = String(body.questionId || "");
    const q = getQuestion(questionId);
    if (!q || q.paperUserId !== auth.userId) return Response.json({ error: "题目不存在" }, { status: 404 });
    const attempt = saveAttempt({
      userId: auth.userId, questionId, paperId: q.paperId, answer: "",
      score: 0, maxScore: q.score, verdict: "skipped",
      feedback: {
        summary: "已跳过，先看一遍答案和解析，再决定是否做同类题。",
        referenceAnswer: q.answerRaw,
        steps: q.explanation ? [q.explanation] : [],
        knowledgePoints: [q.topic, q.chapter].filter(Boolean),
        nextAction: "看完解析后，可以用「做同类题」立刻验证。",
      },
      skipped: true,
    });
    return Response.json({ attempt, reveal: { answer: q.answerRaw, explanation: q.explanation } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "操作失败" }, { status: 500 });
  }
}
