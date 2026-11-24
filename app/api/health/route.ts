export const runtime = "nodejs";

export async function GET() {
  return Response.json({ ok: true, model: process.env.DEEPSEEK_MODEL });
}
