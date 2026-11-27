import fs from "node:fs";
import path from "node:path";
import type { ToolDefinition } from "./deepseek";
import { applyTutorRoadmapOps, createTutorCheck, getTutorRoadmap, getTutorRoadmapText } from "./queries";
import { getTutorRetrievalContext } from "./tutor-retrieval";
import { expandKnowledgeQuery, knowledgeSnippet, searchKnowledge } from "./knowledge";
import { buildLearnerProfile, toLearnerPrompt } from "./learner";
import { generateTutorQuizDraft } from "./tutor-service";
import type { TutorSourceCollector } from "./tutor-sources";

export interface TutorToolContext {
  userId: string;
  conversationId: string;
  /** Collects citable material so the reply can point back at it. */
  sources: TutorSourceCollector;
}

export interface TutorToolResult {
  result: unknown;
  quizId?: string;
  checkId?: string;
  roadmapUpdated?: boolean;
}

const SYLLABUS_LABELS: Record<string, string> = { math2: "数学二", english2: "英语二", politics: "政治", cs408: "408" };

const roadmapAdd = {
  type: "object",
  properties: {
    title: { type: "string", description: "短、可执行的路线项标题" },
    parentId: { type: "string", description: "可选的父路线项 id" },
    status: { type: "string", enum: ["pending", "in_progress", "done"] },
  },
  required: ["title"],
};

export const TUTOR_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_question_bank",
      description: "检索历年真题和扩展题库，返回年份、题号、题干、答案和考点。需要历年考法、真题证据时调用。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "要检索的知识点、题型或题目关键词" },
          subject: { type: "string", enum: ["math2", "english2", "politics", "cs408"] },
          limit: { type: "number", description: "最多返回多少条代表题，默认 8" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge",
      description: "检索本地教材/知识点资料。需要概念、步骤、方法清单或教材原文时调用。",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "要查的知识点或术语" },
          subject: { type: "string", enum: ["math2", "english2", "politics", "cs408"] },
          limit: { type: "number", description: "返回条数，默认 3" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_learner_profile",
      description: "读取学生的学习统计、薄弱章节、近期练习和目标。需要因材施教时调用。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_learning_roadmap",
      description: "读取当前会话的学习路线和状态。需要确认下一步或调整路线时调用。",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_syllabus",
      description: "读取 2027 考研大纲的相关章节和要求。需要确认考纲范围时调用。",
      parameters: {
        type: "object",
        properties: {
          subject: { type: "string", enum: ["math2", "english2", "politics", "cs408"] },
          query: { type: "string", description: "可选，章节或考点关键词" },
        },
        required: ["subject"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_learning_roadmap",
      description: "调整当前会话的学习路线：新增前置点、拆分当前项或更新状态。仅真实需要调整时调用。",
      parameters: {
        type: "object",
        properties: {
          add: { type: "array", items: roadmapAdd },
          update: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                status: { type: "string", enum: ["pending", "in_progress", "done"] },
              },
              required: ["id", "status"],
            },
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_quiz",
      description: "按当前知识点生成一道四选一巩固题，返回题目、选项、标准答案和解析。正文不需要再贴题目。",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "可选的出题知识点" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_check",
      description: "生成一个快速检查卡：判断/自评或单个填空。返回检查题、类型、选项和标准答案。",
      parameters: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["yesno", "fill"] },
          prompt: { type: "string", description: "显示给学生的检查题" },
          options: { type: "array", items: { type: "string" } },
          answer: { type: "string" },
          placeholder: { type: "string" },
        },
        required: ["kind", "prompt"],
      },
    },
  },
];

function text(value: unknown, max = 1200): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function executeTutorTool(
  name: string,
  args: Record<string, unknown>,
  ctx: TutorToolContext,
): Promise<TutorToolResult> {
  switch (name) {
    case "search_question_bank": {
      const query = text(args.query, 500);
      if (!query) throw new Error("query 不能为空");
      const context = getTutorRetrievalContext(ctx.userId, ctx.conversationId, query, ctx.sources);
      return { result: { context } };
    }
    case "search_knowledge": {
      const query = text(args.query, 500);
      const subject = typeof args.subject === "string" ? args.subject : undefined;
      const limit = Math.max(1, Math.min(8, Number(args.limit) || 3));
      const expanded = expandKnowledgeQuery(query);
      const hits = searchKnowledge(expanded, { subject, limit });
      if (!hits.length) return { result: { context: "没有找到匹配的知识点原文。" } };
      const context = hits.map(entry => {
        const ref = ctx.sources.add({
          key: `knowledge:${entry.id}`,
          type: "knowledge",
          title: entry.title,
          meta: `${entry.chapter || "综合"} · ${entry.subject}`,
          excerpt: knowledgeSnippet(entry.text, query, 360),
          detail: entry.text.slice(0, 1800),
          url: `/knowledge/${encodeURIComponent(entry.id)}`,
        });
        return `- [[${ref}]] [${entry.chapter}] ${entry.title}（${entry.source}）\n${knowledgeSnippet(entry.text, query, 900)}`;
      }).join("\n\n");
      return { result: { context } };
    }
    case "get_learner_profile": {
      return { result: { profile: toLearnerPrompt(buildLearnerProfile(ctx.userId)) } };
    }
    case "get_learning_roadmap": {
      return { result: { text: getTutorRoadmapText(ctx.userId, ctx.conversationId), items: getTutorRoadmap(ctx.userId, ctx.conversationId) } };
    }
    case "get_syllabus": {
      const subject = ["math2", "english2", "politics", "cs408"].includes(String(args.subject)) ? String(args.subject) : "cs408";
      const query = text(args.query, 200).toLowerCase();
      const file = path.join(process.cwd(), "data/syllabus", `${subject}-2027.md`);
      if (!fs.existsSync(file)) return { result: { text: "大纲文件不存在" } };
      const lines = fs.readFileSync(file, "utf8").split("\n");
      const picked = lines
        .filter(line => !query || line.toLowerCase().includes(query) || query.split(/\s+/).some(term => line.includes(term)))
        .slice(0, 40)
        .join("\n");
      const body = picked || lines.slice(0, 80).join("\n");
      const label = SYLLABUS_LABELS[subject] || subject;
      const ref = ctx.sources.add({
        key: `syllabus:${subject}:${query}`,
        type: "syllabus",
        title: `${label} 2027 大纲`,
        meta: "2027 考试大纲",
        excerpt: `${query ? `“${query}”相关：` : ""}${body.replace(/\s+/g, " ").slice(0, 220)}`,
        detail: body.slice(0, 2400),
        url: `/syllabus#${subject}`,
      });
      return { result: { text: `[[${ref}]]\n${body}` } };
    }
    case "update_learning_roadmap": {
      const add = Array.isArray(args.add) ? args.add.slice(0, 20) : [];
      const update = Array.isArray(args.update) ? args.update.slice(0, 40) : [];
      const roadmap = applyTutorRoadmapOps(ctx.userId, ctx.conversationId, {
        add: add as any,
        update: update as any,
      });
      return { result: { roadmap }, roadmapUpdated: true };
    }
    case "generate_quiz": {
      const topic = text(args.topic, 100) || undefined;
      const { quizId, quiz } = await generateTutorQuizDraft(ctx.userId, ctx.conversationId, topic);
      return {
        quizId,
        result: {
          quizId,
          stem: quiz.stem,
          options: quiz.options,
          answer: quiz.answer,
          explanation: quiz.explanation,
          topic: quiz.topic,
          difficulty: quiz.difficulty,
        },
      };
    }
    case "generate_check": {
      const kind = args.kind === "yesno" ? "yesno" : "fill";
      const prompt = text(args.prompt, 300);
      if (!prompt) throw new Error("prompt 不能为空");
      const options = Array.isArray(args.options) ? args.options.map(o => text(o, 60)).filter(Boolean).slice(0, 4) : [];
      const checkId = createTutorCheck(ctx.userId, {
        kind,
        prompt,
        options,
        answer: text(args.answer, 120),
        placeholder: text(args.placeholder, 60),
      });
      return {
        checkId,
        result: {
          checkId,
          kind,
          prompt,
          options,
          answer: text(args.answer, 120),
          placeholder: text(args.placeholder, 60),
        },
      };
    }
    default:
      throw new Error(`未知工具：${name}`);
  }
}
