import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { createTutorConversation, listTutorConversations } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const auth = await requireUserApi();
  if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
  const archived = req.nextUrl.searchParams.get("archived") === "1";
  const q = req.nextUrl.searchParams.get("q") || "";
  return Response.json({ conversations: listTutorConversations(auth.userId, archived, q) });
}

export async function POST() {
  const auth = await requireUserApi();
  if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json({ conversation: createTutorConversation(auth.userId) });
}
