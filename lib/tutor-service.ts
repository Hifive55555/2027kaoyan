import { chatJson } from "./deepseek";
import { buildLearnerProfile, toLearnerPrompt } from "./learner";
import { buildTutorQuizMessages, type TutorQuizDraft } from "./prompts";
import { normalizeTutorQuiz } from "./tutor";
import {
  createTutorQuiz,
  getTutorMessages,
  getTutorQuiz,
  saveTutorMessage,
} from "./queries";
import type { TutorMessage } from "./types";

export async function generateTutorQuizMessage(userId: string, topic?: string): Promise<TutorMessage> {
  const history = getTutorMessages(userId, 20).map(m => ({ role: m.role, content: m.content }));
  const profile = buildLearnerProfile(userId);
  const raw = await chatJson<TutorQuizDraft>(buildTutorQuizMessages({
    profileText: toLearnerPrompt(profile),
    topic,
    history,
  }), { maxTokens: 1500, temperature: 0.62, timeoutMs: 90000 });
  const quiz = normalizeTutorQuiz(raw);
  if (!quiz) throw new Error("这次题目没有生成成功，再试一次");
  const quizId = createTutorQuiz(userId, quiz);
  const assistant = saveTutorMessage(
    userId,
    "assistant",
    "好，我们做一道题巩固一下。先自己选，选完我再根据你的答案接着讲。",
    quizId
  );
  return { ...assistant, quiz: getTutorQuiz(quizId, userId) || undefined };
}
