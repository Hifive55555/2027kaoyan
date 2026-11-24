import { AppShell } from "@/components/AppShell";
import { PracticeSetup } from "@/components/PracticeSetup";
import { SUBJECTS } from "@/lib/subjects";

export const dynamic = "force-dynamic";

export default async function PracticePage({ searchParams }: { searchParams: Promise<{ subject?: string; chapter?: string }> }) {
  const sp = await searchParams;
  const initial = SUBJECTS.find(s => s.id === sp.subject)?.id || "math2";
  return (
    <AppShell>
      <PracticeSetup subjects={SUBJECTS} initialSubject={initial} initialChapter={sp.chapter} />
    </AppShell>
  );
}
