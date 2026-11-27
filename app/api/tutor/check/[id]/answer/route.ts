import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { getTutorCheck, getTutorCheckRaw, saveTutorCheckAttempt, saveTutorMessage, getTutorConversation, getTutorConversationForCheck, getOrCreateActiveTutorConversation, getAnswerContext } from "@/lib/queries";
import { buildCheckAnswerEvent } from "@/lib/tutor-events";

export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireUserApi();
    if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
    const { id } = await ctx.params;
    const check = getTutorCheckRaw(id, auth.userId);
    if (!check) return Response.json({ error: "检查不存在" }, { status: 404 });
    if (check.attempt) return Response.json({ check, systemMessage: null });

    const body = await req.json().catch(() => ({}));
    const response = String(body.response || "").trim().slice(0, 300);
    if (!response) return Response.json({ error: "请先作答" }, { status: 400 });
    const conversationId = getTutorConversationForCheck(auth.userId, id) || getOrCreateActiveTutorConversation(auth.userId).id;
    const conversation = getTutorConversation(auth.userId, conversationId);
    if (!conversation || conversation.archivedAt) return Response.json({ error: "对话不存在或已归档" }, { status: 409 });

    // Record the raw answer only. The teacher already has the generated
    // question and expected answer in its tool-call history.
    saveTutorCheckAttempt(auth.userId, id, response, null);
    const { chip, event } = buildCheckAnswerEvent({
      check,
      response,
      context: getAnswerContext(auth.userId, conversationId, { checkId: id }),
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
    return Response.json({ check: getTutorCheck(id, auth.userId), systemMessage, correct: null });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "提交失败" }, { status: 500 });
  }
}
