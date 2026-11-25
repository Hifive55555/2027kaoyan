import { AppShell } from "@/components/AppShell";
import { TutorClient } from "@/components/TutorClient";
import { requireUserPage } from "@/lib/auth";
import { buildLearnerProfile, learnerSuggestions } from "@/lib/learner";
import { getTutorMessages, getTutorRoadmap } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function TutorPage() {
  const session = await requireUserPage();
  const profile = buildLearnerProfile(session.userId!);
  const messages = getTutorMessages(session.userId!, 80);
  const roadmap = getTutorRoadmap(session.userId!);
  return (
    <AppShell>
      <TutorClient
        initialMessages={messages}
        initialProfile={profile}
        initialGoal={profile.goal}
        initialRoadmap={roadmap}
        suggestions={learnerSuggestions(profile)}
      />
    </AppShell>
  );
}
