import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { buildChatMessages } from "@/lib/prompts";
import { streamChat } from "@/lib/deepseek";
import { getLatestRandomAttempt, getRandomQuestionDetail } from "@/lib/random";
import { getRandomMessages, saveRandomMessage } from "@/lib/queries";
import { getSubjectSafe } from "@/lib/grade-helpers";
import { buildLearnerProfile, toLearnerPrompt } from "@/lib/learner";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function GET(req: NextRequest) {
  const auth = await requireUserApi();
  if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
  const questionId = req.nextUrl.searchParams.get("questionId") || "";
  if (!questionId) return Response.json({ error: "缺少 questionId" }, { status: 400 });
  if (!getRandomQuestionDetail(questionId, auth.userId)) return Response.json({ error: "题目不存在" }, { status: 404 });
  return Response.json({ messages: getRandomMessages(auth.userId, questionId) });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserApi();
    if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
    const body = await req.json();
    const questionId = String(body.questionId || "");
    const message = String(body.message || "").trim();
    if (!questionId || !message) return Response.json({ error: "缺少内容" }, { status: 400 });
    const q = getRandomQuestionDetail(questionId, auth.userId);
    if (!q) return Response.json({ error: "题目不存在" }, { status: 404 });
    const subject = getSubjectSafe(q.subject);
    if (!subject) return Response.json({ error: "科目配置缺失" }, { status: 500 });

    saveRandomMessage(auth.userId, questionId, "user", message);
    const history = getRandomMessages(auth.userId, questionId).map(m => ({ role: m.role, content: m.content }));
    const latest = getLatestRandomAttempt(auth.userId, questionId);
    const canReveal = !!latest;
    const messages = buildChatMessages({
      subject,
      question: {
        stem: q.stem,
        options: q.options,
        answer: canReveal ? q.answer : "（学生尚未作答，请先引导学生思考，不要直接给出答案）",
        explanation: canReveal ? q.explanation : "",
        type: q.type,
      },
      attempt: latest ? {
        answer: latest.answer,
        score: latest.correct ? 1 : 0,
        maxScore: 1,
        feedback: { summary: latest.correct ? "随机刷题答对" : "随机刷题答错" },
      } : null,
      history,
      profileText: toLearnerPrompt(buildLearnerProfile(auth.userId)),
    });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let full = "";
        const send = (obj: unknown) => {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* closed */ }
        };
        try {
          await streamChat(messages, delta => {
            full += delta;
            send({ delta });
          }, { maxTokens: 4000, temperature: 0.6 });
          if (full.trim()) saveRandomMessage(auth.userId, questionId, "assistant", full);
          send({ done: true });
        } catch (err) {
          send({ error: err instanceof Error ? err.message : "回答失败" });
        } finally {
          try { controller.close(); } catch { /* closed */ }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "回答失败" }, { status: 500 });
  }
}
