import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { streamChat } from "@/lib/deepseek";
import { buildTutorMessages } from "@/lib/prompts";
import { buildLearnerProfile, toLearnerPrompt } from "@/lib/learner";
import { limitTutorReply } from "@/lib/tutor";
import { generateTutorQuizMessage } from "@/lib/tutor-service";
import { deleteTutorMessage, getTutorMessages, saveTutorMessage } from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  let userMessageId: string | undefined;
  let userId: string | undefined;
  try {
    const auth = await requireUserApi();
    if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
    userId = auth.userId;
    const body = await req.json().catch(() => ({}));
    const message = String(body.message || "").trim().slice(0, 2000);
    if (!message) return Response.json({ error: "写点什么再问老师" }, { status: 400 });

    const userMessage = saveTutorMessage(auth.userId, "user", message);
    userMessageId = userMessage.id;
    const history = getTutorMessages(auth.userId, 80)
      .map(m => ({ role: m.role, content: m.content }));
    const profile = buildLearnerProfile(auth.userId);
    const messages = buildTutorMessages({
      profileText: toLearnerPrompt(profile),
      history,
    });

    let full = "";
    await streamChat(messages, delta => { full += delta; }, {
      maxTokens: 2000,
      temperature: 0.55,
    });
    const explicitQuiz = /出题|来一道|练一题|做一道题/.test(message) && !/(?:别|不要|不用|先不|不想).{0,6}出题/.test(message);
    const markerQuiz = /\[\[QUIZ\]\]/i.test(full);
    const implicitQuiz = /(?:给你|我们|要不|我).{0,12}(?:出|做|练).{0,8}(?:一道|一题)|巩固一下|试一道/.test(full);
    const readyQuiz = /(?:懂了|明白了|理解了|会了|原来如此|继续|下一步|然后呢)/.test(message) && !/别|不要|不用|先不|还没/.test(message);
    const clean = full.replace(/\[\[QUIZ\]\]/gi, "").trim();
    const reply = limitTutorReply(clean) || "我先不急着讲完整。你能说说自己目前卡在哪一步吗？";
    const assistant = saveTutorMessage(auth.userId, "assistant", reply);
    // Do not stack another quiz if the student still has an unanswered one on screen.
    const recent = getTutorMessages(auth.userId, 12);
    const lastQuiz = [...recent].reverse().find(m => m.quiz);
    const hasPendingQuiz = !!lastQuiz?.quiz && !lastQuiz.quiz.attempt;
    const wantsQuiz = !hasPendingQuiz && (markerQuiz || explicitQuiz || implicitQuiz || readyQuiz);
    let quizMessage = null;
    if (wantsQuiz) {
      try { quizMessage = await generateTutorQuizMessage(auth.userId); } catch (err) { console.error("[tutor] auto quiz failed:", err); }
    }
    return Response.json({ message: assistant, extraMessages: quizMessage ? [quizMessage] : [] });
  } catch (err) {
    if (userMessageId && userId) deleteTutorMessage(userId, userMessageId);
    return Response.json({ error: err instanceof Error ? err.message : "老师暂时没回答上来" }, { status: 502 });
  }
}
