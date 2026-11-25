import { AppShell } from "@/components/AppShell";
import { TutorClient } from "@/components/TutorClient";
import { requireUserPage } from "@/lib/auth";
import { buildLearnerProfile, learnerSuggestions } from "@/lib/learner";
import { getOrCreateActiveTutorConversation, getTutorMessages, getTutorRoadmap } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function TutorPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const session = await requireUserPage();
  const sp = await searchParams;
  const conversation = getOrCreateActiveTutorConversation(session.userId!, sp.c);
  const profile = buildLearnerProfile(session.userId!);
  const messages = getTutorMessages(session.userId!, conversation.id);
  const roadmap = getTutorRoadmap(session.userId!);
  return (
    <AppShell>
      <TutorClient
        initialConversation={conversation}
        initialMessages={messages}
        initialProfile={profile}
        initialGoal={profile.goal}
        initialRoadmap={roadmap}
        suggestions={learnerSuggestions(profile)}
      />
    </AppShell>
  );
}
