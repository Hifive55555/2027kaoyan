import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { generateTutorQuizMessage } from "@/lib/tutor-service";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserApi();
    if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    const topic = String(body.topic || "").trim().slice(0, 120);
    const message = await generateTutorQuizMessage(auth.userId, topic);
    return Response.json({ message });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "出题失败，再试一次" }, { status: 502 });
  }
}
