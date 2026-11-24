import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ user: null });
  return Response.json({
    user: {
      id: session.id,
      kind: session.kind,
      username: session.username,
      displayName: session.displayName,
      expiresAt: session.expiresAt,
    },
  });
}
