export interface RandomQuestionPublic {
  id: string;
  subject: string;
  subjectName: string;
  year: number;
  number: number;
  type: string;
  chapter: string;
  topic: string;
  difficulty: string;
  stem: string;
  options: { key: string; text: string }[];
  generated?: boolean;
}

export interface GeneratedRandomQuestion extends RandomQuestionPublic {
  answer: string;
  explanation: string;
  generated: true;
}
