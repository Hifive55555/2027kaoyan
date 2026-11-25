import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { getTutorCheck, getTutorCheckRaw, saveTutorCheckAttempt, saveTutorMessage, getTutorConversation, getTutorConversationForCheck, getOrCreateActiveTutorConversation } from "@/lib/queries";
import { judgeTutorCheckAnswer } from "@/lib/tutor-judge";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    const expected = String(check.answer || "").trim();
    const correct = check.kind === "yesno"
      ? (expected ? response.toLowerCase().trim() === expected.toLowerCase().trim() : null)
      : await judgeTutorCheckAnswer({ prompt: check.prompt, expected, response });
    saveTutorCheckAttempt(auth.userId, id, response, correct);
    const label = check.prompt.length > 48 ? `${check.prompt.slice(0, 48)}…` : check.prompt;
    const outcome = correct === null ? "" : correct ? "（正确）" : "（与预期不同）";
    const conversationId = getTutorConversationForCheck(auth.userId, id) || getOrCreateActiveTutorConversation(auth.userId).id;
    if (getTutorConversation(auth.userId, conversationId)?.archivedAt) return Response.json({ error: "对话已归档，请先取消归档" }, { status: 409 });
    const systemMessage = saveTutorMessage(
      auth.userId,
      conversationId,
      "system",
      `已完成快速检查「${label}」：回答 ${response}${outcome}。`
    );
    return Response.json({ check: getTutorCheck(id, auth.userId), systemMessage, correct });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "提交失败" }, { status: 500 });
  }
}
