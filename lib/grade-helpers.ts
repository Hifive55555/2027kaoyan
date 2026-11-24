import { getQuestion } from "./queries";
import { SUBJECTS } from "./subjects";
import type { SubjectConfig } from "./types";

export function getSubjectSafe(subject: string): SubjectConfig | undefined {
  return SUBJECTS.find(s => s.id === subject);
}

export { getQuestion, saveAttempt } from "./queries";
