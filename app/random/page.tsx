import { requireUserPage } from "@/lib/auth";
import { getRandomStats, pickRandomQuestion } from "@/lib/random";
import { RandomClient } from "@/components/RandomClient";

export const dynamic = "force-dynamic";

export default async function RandomPage() {
  const session = await requireUserPage();
  const first = pickRandomQuestion(session.userId!);
  const stats = getRandomStats(session.userId!);
  if (!first) {
    return <div className="p-10 text-center text-muted">题库暂时为空。</div>;
  }
  return <RandomClient initial={first} initialStats={stats} displayName={session.displayName} />;
}
