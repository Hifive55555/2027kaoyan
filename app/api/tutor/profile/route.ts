import { NextRequest } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { getTutorGoal, setTutorGoal } from "@/lib/queries";
import { buildLearnerProfile } from "@/lib/learner";

export const runtime = "nodejs";

export async function GET() {
  const auth = await requireUserApi();
  if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json({ goal: getTutorGoal(auth.userId), profile: buildLearnerProfile(auth.userId) });
}

export async function POST(req: NextRequest) {
  const auth = await requireUserApi();
  if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const goal = String(body.goal || "").trim().slice(0, 500);
  setTutorGoal(auth.userId, goal);
  return Response.json({ ok: true, goal });
}
