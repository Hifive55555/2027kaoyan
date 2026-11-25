import { requireUserApi } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Deprecated: conversation switching now creates a new conversation instead
 * of deleting the existing thread. Keep this endpoint as a safe no-op so a
 * stale browser tab cannot wipe all tutor history.
 */
export async function POST() {
  const auth = await requireUserApi();
  if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
  return Response.json({ ok: true, deprecated: true });
}
