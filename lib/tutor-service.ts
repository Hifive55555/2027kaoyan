import { chatJson } from "./deepseek";
import { buildLearnerProfile, toLearnerPrompt } from "./learner";
import { buildTutorQuizMessages, type TutorQuizDraft } from "./prompts";
import { normalizeTutorQuiz } from "./tutor";
import {
  attachTutorQuiz,
  createTutorQuiz,
  getTutorMessages,
  getTutorQuiz,
  saveTutorMessage,
} from "./queries";
import type { TutorMessage } from "./types";

export async function generateTutorQuizMessage(
  userId: string,
  conversationId: string,
  topic?: string,
  attachToMessageId?: string,
): Promise<TutorMessage> {
  const history = getTutorMessages(userId, conversationId, 20)
    .filter(m => m.role !== "system" && m.content.trim())
    .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));
  const profile = buildLearnerProfile(userId);
  const raw = await chatJson<TutorQuizDraft>(buildTutorQuizMessages({
    profileText: toLearnerPrompt(profile),
    topic,
    history,
  }), { maxTokens: 3000, temperature: 0.62, timeoutMs: 180000, effort: "high" });
  const quiz = normalizeTutorQuiz(raw);
  if (!quiz) throw new Error("这次题目没有生成成功，再试一次");
  const quizId = createTutorQuiz(userId, quiz);

  if (attachToMessageId) {
    const attached = attachTutorQuiz(userId, conversationId, attachToMessageId, quizId);
    if (attached) return attached;
  }

  const assistant = saveTutorMessage(userId, conversationId, "assistant", "", quizId);
  return { ...assistant, quiz: getTutorQuiz(quizId, userId) || undefined };
}
