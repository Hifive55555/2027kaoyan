import { requireUserApi } from "@/lib/auth";
import { resetTutorMessages } from "@/lib/queries";

export const runtime = "nodejs";

export async function POST() {
  const auth = await requireUserApi();
  if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
  resetTutorMessages(auth.userId);
  return Response.json({ ok: true });
}
