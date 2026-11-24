import { NextRequest } from "next/server";
import { loginUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    if (!username || !password) return Response.json({ error: "请输入用户名和密码" }, { status: 400 });
    const session = await loginUser(username, password);
    if (!session) return Response.json({ error: "用户名或密码不正确" }, { status: 401 });
    return Response.json({ ok: true, user: { username: session.username, displayName: session.displayName } });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "登录失败" }, { status: 500 });
  }
}
