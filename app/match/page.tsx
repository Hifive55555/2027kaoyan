import { requireSessionPage } from "@/lib/auth";
import { MatchLobby } from "@/components/MatchLobby";
import { getRecentMatches } from "@/lib/match";

export const dynamic = "force-dynamic";

export default async function MatchPage() {
  const session = await requireSessionPage("/match");
  const recent = session.kind === "user" && session.userId ? getRecentMatches(session.userId, 5) : [];
  return <MatchLobby displayName={session.displayName} isGuest={session.kind === "guest"} recent={recent} />;
}
