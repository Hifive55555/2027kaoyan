import { NextRequest } from "next/server";
import { generatePaper } from "@/lib/generate";
import { requireUserApi } from "@/lib/auth";
import type { SubjectId } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserApi();
    if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
    const body = await req.json();
    const subject = body.subject as SubjectId;
    const chapterIds: string[] = Array.isArray(body.chapterIds) ? body.chapterIds.map(String) : [];
    const mode = String(body.mode || "quick");
    if (!["math2", "english2", "politics", "cs408"].includes(subject)) {
      return Response.json({ error: "未知科目" }, { status: 400 });
    }
    const result = await generatePaper({ userId: auth.userId, subjectId: subject, chapterIds, modeId: mode });
    return Response.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
