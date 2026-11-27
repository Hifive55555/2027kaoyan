import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { streamChatWithTools, type ChatMessageInput } from "@/lib/deepseek";
import { buildTutorMessages } from "@/lib/prompts";
import { TUTOR_TOOLS, executeTutorTool } from "@/lib/tutor-tools";
import { createTutorSourceCollector, finalizeCitations, stripUnknownCitations } from "@/lib/tutor-sources";
import { limitTutorReply } from "@/lib/tutor";
import { generateTutorConversationTitle } from "@/lib/tutor-title";
import {
  getTutorCheck,
  getTutorCheckRaw,
  getTutorConversation,
  getTutorConversationForCheck,
  getTutorConversationForQuiz,
  getOrCreateActiveTutorConversation,
  getTutorHistory,
  getTutorQuiz,
  getTutorQuizRaw,
  getTutorRoadmap,
  replaceTutorConversationTitle,
  saveTutorMessage,
  titleTutorConversation,
} from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 300;

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const value = JSON.parse(raw || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/** Which status line the client shows while a tool runs. */
const TOOL_PHASE: Record<string, "searching" | "quiz" | "checking"> = {
  search_question_bank: "searching",
  search_knowledge: "searching",
  get_syllabus: "searching",
  generate_quiz: "quiz",
  generate_check: "checking",
};

function streamTutorReply(input: {
  userId: string;
  conversationId: string;
  history: ReturnType<typeof getTutorHistory>;
  currentUser: string;
  fallback: string;
  userMessageId?: string;
  firstTurn?: boolean;
}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch { /* client disconnected */ }
      };
      let full = "";
      let quizId: string | undefined;
      let checkId: string | undefined;
      const sourceCollector = createTutorSourceCollector();
      let messages: ChatMessageInput[] = buildTutorMessages({
        history: input.history.filter(m => m.role !== "system").map(m => ({
          role: m.role === "tool" ? "tool" : m.role === "assistant" ? "assistant" : "user",
          content: m.content,
          toolCalls: m.toolCalls,
          toolCallId: m.toolCallId,
          name: m.toolName,
        })),
        currentUser: input.currentUser,
      });

      try {
        while (true) {
          const round = await streamChatWithTools(messages, TUTOR_TOOLS, delta => {
            full += delta;
            send({ delta });
          }, {
            maxTokens: 4000,
            temperature: 0.55,
            effort: "high",
          });

          if (!round.toolCalls.length) break;

          // Persist the assistant tool-call turn and feed the tool results back.
          saveTutorMessage(
            input.userId,
            input.conversationId,
            "assistant",
            "",
            undefined,
            undefined,
            { toolCalls: round.toolCalls },
          );
          messages.push({
            role: "assistant",
            content: round.text || null,
            tool_calls: round.toolCalls,
          });

          let terminal = false;
          for (const call of round.toolCalls) {
            const name = call.function?.name || "";
            const args = parseArgs(call.function?.arguments || "{}");
            const phase = TOOL_PHASE[name];
            if (phase) send({ status: { phase } });
            let toolResult: Awaited<ReturnType<typeof executeTutorTool>>;
            try {
              toolResult = await executeTutorTool(name, args, {
                userId: input.userId,
                conversationId: input.conversationId,
                sources: sourceCollector,
              });
            } catch (err) {
              toolResult = { result: { error: err instanceof Error ? err.message : "工具执行失败" } };
            }
            const found = sourceCollector.list();
            if (found.length) send({ sources: found });
            if (phase === "searching") send({ status: { phase, counts: sourceCollector.counts() } });
            if (toolResult.quizId) {
              quizId = toolResult.quizId;
              terminal = true;
            }
            if (toolResult.checkId) {
              checkId = toolResult.checkId;
              terminal = true;
            }
            const content = JSON.stringify(toolResult.result);
            saveTutorMessage(
              input.userId,
              input.conversationId,
              "tool",
              content,
              undefined,
              undefined,
              { toolCallId: call.id, toolName: name },
            );
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name,
              content,
            });
          }

          // A generated card is a turn-ending action: the student must answer
          // before the teacher continues. Without this boundary the model
          // writes post-tool commentary that renders above the card.
          if (terminal) break;
          send({ status: { phase: "writing" } });
        }

        const rawReply = limitTutorReply(full.trim()) || (!quizId && !checkId ? input.fallback : "");
        const cited = finalizeCitations(rawReply, sourceCollector.list());
        const reply = stripUnknownCitations(rawReply, cited.sources);
        const assistant = saveTutorMessage(
          input.userId,
          input.conversationId,
          "assistant",
          reply,
          quizId,
          checkId,
          cited.sources.length
            ? { citations: { list: cited.sources, uncited: cited.uncited } }
            : {},
        );
        let conversationTitle = getTutorConversation(input.userId, input.conversationId)?.title || "新的对话";
        if (input.firstTurn) {
          const titleAssistant = reply || (quizId ? getTutorQuizRaw(quizId, input.userId)?.stem || "" : "")
            || (checkId ? getTutorCheckRaw(checkId, input.userId)?.prompt || "" : "");
          try {
            const generated = await generateTutorConversationTitle(input.currentUser, titleAssistant);
            if (generated) {
              const replaced = replaceTutorConversationTitle(
                input.userId,
                input.conversationId,
                conversationTitle,
                generated,
              );
              if (replaced) conversationTitle = replaced;
            }
          } catch {
            // The provisional title from the student's first message is enough.
          }
        }
        send({
          done: true,
          message: {
            ...assistant,
            quiz: quizId ? getTutorQuiz(quizId, input.userId) || undefined : undefined,
            check: checkId ? getTutorCheck(checkId, input.userId) || undefined : undefined,
            sources: cited.sources.length ? cited.sources : undefined,
            uncitedSources: cited.uncited || undefined,
          },
          roadmap: getTutorRoadmap(input.userId, input.conversationId),
          conversationId: input.conversationId,
          conversationTitle,
          extraMessages: [],
        });
      } catch (err) {
        if (input.userMessageId) {
          // Keep the user message on tool errors so they can retry; only the
          // failed assistant turn is absent.
        }
        send({ error: err instanceof Error ? err.message : "老师暂时没回答上来" });
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
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserApi();
    if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
    const body = await req.json().catch(() => ({}));

    const eventQuizId = String(body.eventQuizId || "");
    if (eventQuizId) {
      const quiz = getTutorQuizRaw(eventQuizId, auth.userId);
      if (!quiz || !quiz.attempt) return Response.json({ error: "答题记录不存在" }, { status: 404 });
      const conversationId = String(body.conversationId || "") || getTutorConversationForQuiz(auth.userId, eventQuizId);
      const conversation = conversationId ? getTutorConversation(auth.userId, conversationId) : null;
      if (!conversation || conversation.archivedAt) return Response.json({ error: "对话不存在或已归档" }, { status: 409 });
      return streamTutorReply({
        userId: auth.userId,
        conversationId: conversation.id,
        history: getTutorHistory(auth.userId, conversation.id),
        currentUser: `【系统事件】学生提交了答案：${quiz.attempt.answer}`,
        fallback: "我们先停一下。你觉得刚才那一步的关键是什么？",
      });
    }

    const eventCheckId = String(body.eventCheckId || "");
    if (eventCheckId) {
      const check = getTutorCheckRaw(eventCheckId, auth.userId);
      if (!check || !check.attempt) return Response.json({ error: "检查记录不存在" }, { status: 404 });
      const conversationId = String(body.conversationId || "") || getTutorConversationForCheck(auth.userId, eventCheckId);
      const conversation = conversationId ? getTutorConversation(auth.userId, conversationId) : null;
      if (!conversation || conversation.archivedAt) return Response.json({ error: "对话不存在或已归档" }, { status: 409 });
      return streamTutorReply({
        userId: auth.userId,
        conversationId: conversation.id,
        history: getTutorHistory(auth.userId, conversation.id),
        currentUser: `【系统事件】学生提交了答案：${check.attempt.response}`,
        fallback: "我们先停一下。你觉得自己刚才那一步的关键是什么？",
      });
    }

    const message = String(body.message || "").trim().slice(0, 2000);
    if (!message) return Response.json({ error: "写点什么再问老师" }, { status: 400 });
    const requestedConversation = String(body.conversationId || "");
    const conversation = requestedConversation
      ? getTutorConversation(auth.userId, requestedConversation)
      : getOrCreateActiveTutorConversation(auth.userId);
    if (!conversation) return Response.json({ error: "对话不存在" }, { status: 404 });
    if (conversation.archivedAt) return Response.json({ error: "对话已归档，请先取消归档" }, { status: 409 });

    const firstTurn = conversation.title === "新的对话";
    const userMessage = saveTutorMessage(auth.userId, conversation.id, "user", message);
    if (firstTurn) titleTutorConversation(auth.userId, conversation.id, message);
    return streamTutorReply({
      userId: auth.userId,
      conversationId: conversation.id,
      history: getTutorHistory(auth.userId, conversation.id, userMessage.id),
      currentUser: message,
      fallback: "我先不急着讲完整。你能说说自己目前卡在哪一步吗？",
      userMessageId: userMessage.id,
      firstTurn,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "老师暂时没回答上来" }, { status: 502 });
  }
}
