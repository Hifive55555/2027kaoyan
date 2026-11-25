export type SubjectId = "math2" | "english2" | "politics" | "cs408";

export type QuestionType =
  | "choice"
  | "multiple"
  | "fill"
  | "solution"
  | "single"
  | "analysis"
  | "cloze"
  | "reading"
  | "newtype"
  | "translation"
  | "writing"
  | "comprehensive"
  | "short";

export interface Option {
  key: string;
  text: string;
}

export interface QuestionPublic {
  id: string;
  paperId: string;
  sectionId: string;
  number: number;
  type: QuestionType;
  stem: string;
  options: Option[];
  score: number;
  difficulty: string;
  topic: string;
  chapter: string;
  sourceNote: string;
  attempt?: AttemptPublic | null;
  revealed?: boolean;
  reveal?: { answer: string; explanation: string };
}

export interface SectionPublic {
  id: string;
  label: string;
  material: string;
  questionIds: string[];
}

export interface PaperPublic {
  id: string;
  subject: SubjectId;
  chapter: string;
  chapterIds: string[];
  mode: string;
  title: string;
  durationMin: number;
  createdAt: string;
  sections: SectionPublic[];
  questions: QuestionPublic[];
  totalScore: number;
}

export interface GradeDimension {
  name: string;
  score: number;
  max: number;
  comment: string;
}

export interface GradeFeedback {
  summary?: string;
  dimensions?: GradeDimension[];
  strengths?: string[];
  issues?: string[];
  referenceAnswer?: string;
  steps?: string[];
  knowledgePoints?: string[];
  nextAction?: string;
  [key: string]: unknown;
}

export interface AttemptPublic {
  id: string;
  questionId: string;
  answer: string;
  imagePath?: string | null;
  score: number | null;
  maxScore: number | null;
  verdict: "correct" | "partial" | "wrong" | "skipped" | null;
  feedback: GradeFeedback;
  skipped: boolean;
  createdAt: string;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
}

export interface SubjectChapter {
  id: string;
  name: string;
  weight?: number;
  children?: SubjectChapter[];
}

export interface QuestionPlan {
  type: QuestionType;
  name: string;
  count: number;
  score: number;
}

export interface PracticeMode {
  id: string;
  name: string;
  description: string;
  minutes: number;
  plan: QuestionPlan[];
}

export interface SubjectConfig {
  id: SubjectId;
  name: string;
  short: string;
  code: string;
  accent: string;
  duration: number;
  totalScore: number;
  description: string;
  structure: QuestionPlan[];
  highlights: string[];
  chapters: SubjectChapter[];
  modes: PracticeMode[];
}

export interface LearnerChapterStat {
  chapter: string;
  attempts: number;
  wrong: number;
  accuracy: number;
}

export interface LearnerSubjectStat {
  attempts: number;
  correct: number;
  accuracy: number;
  weakChapters: LearnerChapterStat[];
}

export interface LearnerMistake {
  subject: SubjectId;
  chapter: string;
  topic: string;
  stem: string;
  source: "paper" | "random" | "match";
  createdAt: string;
}

export interface LearnerQuizResult {
  quizId: string;
  subject: SubjectId;
  chapter: string;
  topic: string;
  stem: string;
  options: TutorQuizOption[];
  answer: string;
  correctAnswer: string;
  correct: boolean;
  createdAt: string;
}

export interface LearnerProfile {
  userId: string;
  overview: {
    totalAttempts: number;
    accuracy: number;
    streak: number;
    todayCount: number;
    lastActive: string | null;
    mistakes: number;
  };
  subjects: Partial<Record<SubjectId, LearnerSubjectStat>>;
  recentMistakes: LearnerMistake[];
  recentQuiz: LearnerQuizResult[];
  goal: string;
  updatedAt: string;
}

export interface TutorQuizOption {
  key: string;
  text: string;
}

export interface TutorQuizPublic {
  id: string;
  subject: SubjectId;
  chapter: string;
  topic: string;
  difficulty: string;
  stem: string;
  options: TutorQuizOption[];
  answer?: string;
  explanation?: string;
  attempt?: {
    answer: string;
    correct: boolean;
    createdAt: string;
  };
}

export interface TutorCheckPublic {
  id: string;
  kind: "yesno" | "fill";
  prompt: string;
  options: string[];
  placeholder: string;
  attempt?: {
    response: string;
    correct?: boolean | null;
    createdAt: string;
  };
}

export interface TutorMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  quiz?: TutorQuizPublic;
  check?: TutorCheckPublic;
}

export interface TutorRoadmapItem {
  id: string;
  parentId: string | null;
  title: string;
  status: "pending" | "in_progress" | "done";
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface TutorConversationPublic {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  messageCount: number;
  lastMessage: string;
  lastMessageAt: string | null;
}
