import { requireSessionPage } from "@/lib/auth";
import { MatchClient } from "@/components/MatchClient";

export const dynamic = "force-dynamic";

export default async function MatchRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSessionPage(`/match/${id}`);
  return <MatchClient matchId={id} displayName={session.displayName} isGuest={session.kind === "guest"} />;
}
