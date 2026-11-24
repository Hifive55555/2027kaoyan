import { NextRequest } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { chatJson } from "@/lib/deepseek";
import { buildGradeMessages } from "@/lib/prompts";
import { getQuestion, getSubjectSafe, saveAttempt } from "@/lib/grade-helpers";
import { requireUserApi } from "@/lib/auth";
import { getUploadOwner } from "@/lib/queries";
import type { GradeFeedback } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

function objectiveScore(type: string, expected: string, actual: string): { correct: boolean; score: number } {
  const norm = (s: string) => String(s || "").toUpperCase().replace(/[^A-Z]/g, "").split("").sort().join("");
  const e = norm(expected);
  const a = norm(actual);
  return { correct: !!a && a === e, score: 0 };
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireUserApi();
    if (!auth) return Response.json({ error: "请先登录" }, { status: 401 });
    const body = await req.json();
    const questionId = String(body.questionId || "");
    const answer = String(body.answer || "");
    const imagePath = body.imagePath ? String(body.imagePath) : "";
    const q = getQuestion(questionId);
    if (!q || q.paperUserId !== auth.userId) return Response.json({ error: "题目不存在" }, { status: 404 });
    const subject = getSubjectSafe(q.paperSubject);
    if (!subject) return Response.json({ error: "科目配置缺失" }, { status: 500 });

    const objective = ["choice", "multiple", "single", "cloze", "reading", "newtype"].includes(q.type);
    if (objective) {
      const { correct } = objectiveScore(q.type, q.answerRaw, answer);
      const feedback: GradeFeedback = {
        summary: correct ? "回答正确，继续保持。" : "答案错误，建议对照解析定位失分点。",
        referenceAnswer: String(q.answerRaw),
        steps: q.explanation ? [q.explanation] : [],
        knowledgePoints: [q.topic, q.chapter].filter(Boolean),
        nextAction: correct ? "可以继续下一题，或做同类题巩固。" : "先看解析，再用同类题验证是否真正掌握。",
      };
      const attempt = saveAttempt({
        userId: auth.userId, questionId, paperId: q.paperId, answer, imagePath,
        score: correct ? q.score : 0, maxScore: q.score,
        verdict: correct ? "correct" : "wrong", feedback,
      });
      return Response.json({ attempt, reveal: { answer: q.answerRaw, explanation: q.explanation } });
    }

    let imageUrl: string | undefined;
    if (imagePath) {
      try {
        const file = imagePath.split("/").pop()!;
        if (getUploadOwner(file) !== auth.userId) throw new Error("图片不属于当前用户");
        const buf = await fs.readFile(path.join(process.cwd(), "data/uploads", file));
        const ext = path.extname(file).toLowerCase();
        const mime = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
        imageUrl = `data:${mime};base64,${buf.toString("base64")}`;
      } catch { /* image optional */ }
    }

    const messages = buildGradeMessages({
      subject,
      question: {
        type: q.type, stem: q.stem, options: q.options, score: q.score,
        chapter: q.chapter, topic: q.topic, answer: q.answerRaw,
        explanation: q.explanation, rubric: q.rubric,
      },
      userAnswer: answer,
      imageUrl,
    });

    const raw = await chatJson<GradeFeedback & { score?: number; verdict?: string }>(messages, {
      maxTokens: 4500, temperature: 0.15, timeoutMs: 120000,
    });
    let score = Number(raw.score);
    if (!Number.isFinite(score)) score = 0;
    score = Math.max(0, Math.min(q.score, score));
    const verdict = score >= q.score * 0.85 ? "correct" : score > 0 ? "partial" : "wrong";
    const feedback: GradeFeedback = {
      summary: raw.summary || "",
      dimensions: Array.isArray(raw.dimensions) ? raw.dimensions : [],
      strengths: Array.isArray(raw.strengths) ? raw.strengths : [],
      issues: Array.isArray(raw.issues) ? raw.issues : [],
      referenceAnswer: raw.referenceAnswer || q.answerRaw,
      steps: Array.isArray(raw.steps) ? raw.steps : [],
      knowledgePoints: Array.isArray(raw.knowledgePoints) ? raw.knowledgePoints : [q.topic, q.chapter].filter(Boolean),
      nextAction: raw.nextAction || "",
    };
    const attempt = saveAttempt({
      userId: auth.userId, questionId, paperId: q.paperId, answer, imagePath,
      score, maxScore: q.score, verdict, feedback,
    });
    return Response.json({ attempt, reveal: { answer: q.answerRaw, explanation: q.explanation } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "批改失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
