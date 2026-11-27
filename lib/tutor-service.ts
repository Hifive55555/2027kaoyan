import { chatJson } from "./deepseek";
import { buildLearnerProfile, toLearnerPrompt } from "./learner";
import { buildTutorQuizMessages, type TutorQuizDraft } from "./prompts";
import { normalizeTutorQuiz } from "./tutor";
import { createTutorQuiz, getTutorMessages, getTutorQuizRaw } from "./queries";

export async function generateTutorQuizDraft(
  userId: string,
  conversationId: string,
  topic?: string,
): Promise<{ quizId: string; quiz: NonNullable<ReturnType<typeof getTutorQuizRaw>> }> {
  const history = getTutorMessages(userId, conversationId, 20)
    .filter(m => m.role !== "system" && m.actor !== "supervisor" && !m.rejected && m.content.trim())
    .map(m => ({ role: m.role as "user" | "assistant", content: m.content.replace(/\[\[S\d+\]\]/g, "") }));
  const profile = buildLearnerProfile(userId);
  const raw = await chatJson<TutorQuizDraft>(buildTutorQuizMessages({
    profileText: toLearnerPrompt(profile),
    topic,
    history,
  }), { maxTokens: 3000, temperature: 0.62, timeoutMs: 180000, effort: "high" });
  const quiz = normalizeTutorQuiz(raw);
  if (!quiz) throw new Error("这次题目没有生成成功，再试一次");
  const quizId = createTutorQuiz(userId, quiz);
  const full = getTutorQuizRaw(quizId, userId);
  if (!full) throw new Error("题目保存失败");
  return { quizId, quiz: full };
}

