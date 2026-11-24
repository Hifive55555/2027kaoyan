import { chatJson } from "@/lib/deepseek";
import { MODEL_NAME } from "@/lib/deepseek";
import { requireUserApi } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST() {
  const t0 = Date.now();
  const auth = await requireUserApi();
  if (!auth) return Response.json({ ok: false, error: "请先登录" }, { status: 401 });
  try {
    const result = await chatJson<{ ok: boolean }>([
      { role: "user", content: "只输出 JSON：{\"ok\":true}" },
    ], { maxTokens: 300, temperature: 0, timeoutMs: 30000 });
    return Response.json({ ok: !!result.ok, model: MODEL_NAME, latencyMs: Date.now() - t0 });
  } catch (err) {
    return Response.json({ ok: false, model: MODEL_NAME, error: err instanceof Error ? err.message : "连接失败", latencyMs: Date.now() - t0 }, { status: 500 });
  }
}
