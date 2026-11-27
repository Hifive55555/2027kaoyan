import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import {
  createTutorConversation,
  createTutorQuiz,
  getQuestion,
  saveTutorMessage,
} from "@/lib/queries";
import { getRandomQuestionDetail } from "@/lib/random";
import { SUBJECTS } from "@/lib/subjects";
import type { SubjectId } from "@/lib/types";

export const runtime = "nodejs";

function clip(value: unknown, max: number) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function subjectOf(value: unknown): SubjectId | null {
  return SUBJECTS.some(subject => subject.id === value) ? value as SubjectId : null;
}

/**
 * Move a temporary follow-up chat into a persistent tutor conversation:
 * the question becomes a normal tutor quiz card and the follow-up transcript
 * is copied message by message, so nothing is squeezed into one user bubble.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserApi();
    if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const raw = body?.question;
    const questionId = clip(raw?.id, 120);
    if (!questionId) return Response.json({ error: "缺少题目" }, { status: 400 });

    // Prefer the server-side copy: it carries the reference answer even when
    // the student has not revealed it yet. Fall back to the client payload.
    const random = getRandomQuestionDetail(questionId, auth.userId);
    const paper = random ? null : getQuestion(questionId);
    const paperOwned = paper && paper.paperUserId === auth.userId ? paper : null;

    const subject = subjectOf(random?.subject) || subjectOf(paperOwned?.paperSubject) || subjectOf(raw?.subject) || null;
    const stem = random?.stem || paperOwned?.stem || clip(raw?.stem, 1200);
    const rawOptions = random?.options || paperOwned?.options || (Array.isArray(raw?.options) ? raw.options : []);
    const options = rawOptions
      .slice(0, 6)
      .map((option: { key?: unknown; text?: unknown }) => ({
        key: clip(option?.key, 2).toUpperCase(),
        text: clip(option?.text, 240),
      }))
      .filter((option: { key: string; text: string }) => option.key && option.text);
    const answer = clip(random?.answer || paperOwned?.answerRaw || body?.reveal?.answer, 40);
    const explanation = String(random?.explanation || paperOwned?.explanation || body?.reveal?.explanation || "").slice(0, 1200);
    const chapter = clip(random?.chapter || paperOwned?.chapter || raw?.chapter, 60);
    const topic = clip(random?.topic || paperOwned?.topic || raw?.topic, 60);
    const difficulty = ["基础", "提高", "冲刺"].includes(String(raw?.difficulty)) ? String(raw.difficulty) : "提高";

    if (!subject || !stem || options.length < 2) {
      return Response.json({ error: "题目信息不完整，暂时不能转入答疑" }, { status: 400 });
    }

    const quizId = createTutorQuiz(auth.userId, {
      subject,
      chapter,
      topic: topic || "追问转答疑",
      difficulty,
      stem,
      options,
      answer,
      explanation,
    });

    const title = clip(topic || chapter || "追问转答疑", 20) || "追问转答疑";
    const conversation = createTutorConversation(auth.userId, title);

    // Short lead so the transcript starts with a user turn; the question itself
    // is rendered as a quiz card, not pasted into the text.
    saveTutorMessage(
      auth.userId,
      conversation.id,
      "user",
      "我们把刚才追问的这道题带到答疑里继续。",
      undefined,
      undefined,
      { actor: "student" },
    );

    // Mirror a normal generate_quiz turn so the tutor's model context contains
    // the question and the reference answer, while the UI shows only the card.
    const callId = `call_import_${Date.now().toString(36)}`;
    saveTutorMessage(
      auth.userId,
      conversation.id,
      "assistant",
      "",
      undefined,
      undefined,
      {
        actor: "teacher",
        visible: false,
        toolCalls: [{ id: callId, type: "function", function: { name: "generate_quiz", arguments: JSON.stringify({ topic: topic || chapter }) } }],
      },
    );
    saveTutorMessage(
      auth.userId,
      conversation.id,
      "tool",
      JSON.stringify({ quizId, stem, options, answer, explanation, topic, difficulty }),
      undefined,
      undefined,
      { actor: "teacher", visible: false, toolCallId: callId, toolName: "generate_quiz" },
    );
    saveTutorMessage(
      auth.userId,
      conversation.id,
      "assistant",
      "我们把这道题放在这里，接着刚才的追问。",
      quizId,
      undefined,
      { actor: "teacher" },
    );

    const messages = Array.isArray(body?.messages)
      ? body.messages
          .filter((message: { role?: unknown; content?: unknown }) => message?.role === "user" || message?.role === "assistant")
          .slice(-12)
          .map((message: { role: "user" | "assistant"; content: unknown }) => ({
            role: message.role,
            content: clip(message.content, 4000),
          }))
          .filter((message: { content: string }) => message.content)
      : [];

    for (const message of messages) {
      saveTutorMessage(
        auth.userId,
        conversation.id,
        message.role === "assistant" ? "assistant" : "user",
        message.content,
        undefined,
        undefined,
        { actor: message.role === "assistant" ? "teacher" : "student" },
      );
    }

    // If the follow-up ended on an unanswered student question, answer it now.
    const last = messages[messages.length - 1];
    return Response.json({ conversationId: conversation.id, continue: last?.role === "user" });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "转入答疑失败" }, { status: 500 });
  }
}
