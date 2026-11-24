import { createGuestSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    const session = await createGuestSession();
    return Response.json({ ok: true, user: { displayName: session.displayName, guest: true } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "游客登录失败" }, { status: 500 });
  }
}
