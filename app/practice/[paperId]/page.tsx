import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PracticeClient } from "@/components/PracticeClient";
import { getPaper } from "@/lib/queries";
import { requireUserPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PracticeSessionPage({ params, searchParams }: { params: Promise<{ paperId: string }>; searchParams: Promise<{ q?: string }> }) {
  const { paperId } = await params;
  const { q } = await searchParams;
  const session = await requireUserPage();
  const paper = getPaper(paperId, { userId: session.userId! });
  if (!paper) notFound();
  return (
    <AppShell>
      <PracticeClient initialPaper={paper} initialQuestionId={q} />
    </AppShell>
  );
}
