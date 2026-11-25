import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { streamChat, type ChatMessageInput } from "@/lib/deepseek";
import { buildTutorMessages } from "@/lib/prompts";
import { buildLearnerProfile, toLearnerPrompt } from "@/lib/learner";
import { getTutorRetrievalContext } from "@/lib/tutor-retrieval";
import { extractTutorCheck, extractTutorRoadmap, limitTutorReply } from "@/lib/tutor";
import { generateTutorQuizMessage } from "@/lib/tutor-service";
import {
  applyTutorRoadmapOps,
  createTutorCheck,
  deleteTutorMessage,
  getTutorCheck,
  getTutorCheckRaw,
  getTutorMessages,
  getTutorQuizRaw,
  getTutorRoadmap,
  getTutorRoadmapText,
  saveTutorMessage,
} from "@/lib/queries";

export const runtime = "nodejs";
export const maxDuration = 180;

function finalizeTutorReply(userId: string, full: string, fallback: string) {
  const markerQuiz = /\[\[QUIZ\]\]/i.test(full);
  const implicitQuiz = /(?:给你|我们|要不|我).{0,12}(?:出|做|练).{0,8}(?:一道|一题)|巩固一下|试一道/.test(full);
  const noQuiz = full.replace(/\[\[QUIZ\]\]/gi, "").trim();
  const roadmapParsed = extractTutorRoadmap(noQuiz);
  const checkParsed = extractTutorCheck(roadmapParsed.text);
  const reply = limitTutorReply(checkParsed.text) || fallback;
  const checkId = checkParsed.check ? createTutorCheck(userId, checkParsed.check) : undefined;
  const roadmap = roadmapParsed.ops ? applyTutorRoadmapOps(userId, roadmapParsed.ops) : getTutorRoadmap(userId);
  return { reply, checkId, roadmap, markerQuiz, implicitQuiz };
}

function formatSources(annotations: any[]): string {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const item of annotations) {
    const c = item?.url_citation || item;
    const url = String(c?.url || "");
    const title = String(c?.title || url).replace(/[\[\]]/g, "").slice(0, 100);
    if (!/^https?:\/\//.test(url) || seen.has(url)) continue;
    seen.add(url);
    rows.push(`- [${title}](${url})`);
    if (rows.length >= 4) break;
  }
  return rows.length ? `\n\n参考来源：\n${rows.join("\n")}` : "";
}

function streamTutorReply(input: {
  userId: string;
  messages: ChatMessageInput[];
  fallback: string;
  userMessageId?: string;
  explicitQuiz?: boolean;
}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let full = "";
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        } catch { /* client disconnected */ }
      };
      let sources: any[] = [];
      try {
        await streamChat(input.messages, delta => {
          full += delta;
          // Deliberately send raw deltas. The browser hides [[CHECK]] /
          // [[QUIZ]] / [[ROADMAP]] blocks while they are being generated;
          // the final `done` event replaces the temporary message with the
          // cleaned, persisted message.
          send({ delta });
        }, { maxTokens: 3000, temperature: 0.55, effort: "high", webSearch: true, onMeta: meta => { sources = meta.annotations; } });

        const finalized = finalizeTutorReply(input.userId, full, input.fallback);
        const replyWithSources = finalized.reply + formatSources(sources);
        const assistant = saveTutorMessage(input.userId, "assistant", replyWithSources, undefined, finalized.checkId);
        let quizMessage = null;

        const wantsQuiz = !finalized.checkId && (finalized.markerQuiz || input.explicitQuiz || finalized.implicitQuiz);
        if (wantsQuiz) {
          const recent = getTutorMessages(input.userId, 12);
          const lastQuiz = [...recent].reverse().find(m => m.quiz);
          const hasPendingQuiz = !!lastQuiz?.quiz && !lastQuiz.quiz.attempt;
          if (!hasPendingQuiz) {
            try {
              quizMessage = await generateTutorQuizMessage(input.userId);
            } catch (err) {
              console.error("[tutor] auto quiz failed:", err);
            }
          }
        }

        send({
          done: true,
          message: {
            ...assistant,
            check: finalized.checkId ? getTutorCheck(finalized.checkId, input.userId) : undefined,
          },
          roadmap: finalized.roadmap,
          extraMessages: quizMessage ? [quizMessage] : [],
        });
      } catch (err) {
        if (input.userMessageId) deleteTutorMessage(input.userId, input.userMessageId);
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
      const history = getTutorMessages(auth.userId, 80).map(m => ({ role: m.role, content: m.content }));
      const profile = buildLearnerProfile(auth.userId);
      const messages = buildTutorMessages({
        profileText: toLearnerPrompt(profile),
        roadmapText: getTutorRoadmapText(auth.userId),
        retrievalText: getTutorRetrievalContext(auth.userId, `${quiz.stem} ${quiz.topic} ${quiz.chapter}`),
        history,
      });
      messages.push({
        role: "system" as const,
        content: `【系统事件】学生刚刚完成了你出的巩固题。
题目：${quiz.stem}
选项：${quiz.options.map(o => `${o.key}. ${o.text}`).join("；")}
学生选择：${quiz.attempt.answer}
正确答案：${quiz.answer}
结果：${quiz.attempt.correct ? "答对" : "答错"}
请根据这个结果自行决定下一步：可以简短确认后推进新内容、继续追问，或直接出下一题；如果答错，先针对错误引导。不要提及“系统事件”，也不要假装学生用文字说过这些话。`,
      });
      return streamTutorReply({
        userId: auth.userId,
        messages,
        fallback: "我们先停一下。你觉得自己刚才那一步的关键是什么？",
      });
    }

    const eventCheckId = String(body.eventCheckId || "");
    if (eventCheckId) {
      const check = getTutorCheckRaw(eventCheckId, auth.userId);
      if (!check || !check.attempt) return Response.json({ error: "检查记录不存在" }, { status: 404 });
      const history = getTutorMessages(auth.userId, 80).map(m => ({ role: m.role, content: m.content }));
      const profile = buildLearnerProfile(auth.userId);
      const messages = buildTutorMessages({
        profileText: toLearnerPrompt(profile),
        roadmapText: getTutorRoadmapText(auth.userId),
        retrievalText: getTutorRetrievalContext(auth.userId, `${check.prompt} ${check.answer}`),
        history,
      });
      const expected = check.answer ? `\n预期答案：${check.answer}\n结果：${check.attempt.correct === null ? "未判定" : check.attempt.correct ? "答对" : "答错"}` : "";
      messages.push({
        role: "system" as const,
        content: `【系统事件】学生刚刚完成了你提出的快速检查。
检查：${check.prompt}
学生回答：${check.attempt.response}${expected}
请根据回答自行决定下一步：可以确认后继续讲、追问原因，或直接推进/出题；如果回答不对，先给一个提示。不要提及“系统事件”，也不要假装学生用文字说过这些话。`,
      });
      return streamTutorReply({
        userId: auth.userId,
        messages,
        fallback: "我们先停一下。你觉得自己刚才那一步的关键是什么？",
      });
    }

    const message = String(body.message || "").trim().slice(0, 2000);
    if (!message) return Response.json({ error: "写点什么再问老师" }, { status: 400 });

    const userMessage = saveTutorMessage(auth.userId, "user", message);
    const history = getTutorMessages(auth.userId, 80).map(m => ({ role: m.role, content: m.content }));
    const profile = buildLearnerProfile(auth.userId);
    const messages = buildTutorMessages({
      profileText: toLearnerPrompt(profile),
      roadmapText: getTutorRoadmapText(auth.userId),
      retrievalText: getTutorRetrievalContext(auth.userId, message),
      history,
    });
    const explicitQuiz = /出题|来一道|练一题|做一道题/.test(message)
      && !/(?:别|不要|不用|先不|不想).{0,6}出题/.test(message);
    return streamTutorReply({
      userId: auth.userId,
      messages,
      fallback: "我先不急着讲完整。你能说说自己目前卡在哪一步吗？",
      userMessageId: userMessage.id,
      explicitQuiz,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "老师暂时没回答上来" }, { status: 502 });
  }
}
