import { streamChatWithTools, type ChatMessageInput, type ToolDefinition } from "./deepseek";
import { getTutorCheckRaw, getTutorQuizRaw } from "./queries";
import { TUTOR_TOOLS, executeTutorTool } from "./tutor-tools";
import { createTutorSourceCollector } from "./tutor-sources";
import type { TutorMessage } from "./types";

/**
 * The supervisor is a reviewer, not a second tutor: it reads the whole
 * conversation like the teacher does, but its only output is PASS or one
 * concrete revision request. Both agents keep their own stable prompt and an
 * append-only history, so prefix caching keeps working.
 */
const SUPERVISOR_SYSTEM = `你是「备考台」的督导，负责在老师的回复发给学生之前审一次稿。你审的是“这一步的教学动作”，不是替老师讲课。

【必须检查】
1. 前置与跳步：是否用了学生还没学过的概念、符号或步骤；该确认的前置有没有确认。
2. 一次一个点：是否同时推进多个新概念，或一轮里塞了太多内容。
3. 考法联系：讲解是否落到考研怎么考（题型、年份、大纲条目）；需要就用工具查证。
4. 验证：该让学生复述、计算或作答时，是否直接跳过了。
5. 事实与题目：结论、公式、答案是否正确；题目是否单一考点、可解、答案唯一、干扰项合理、难度匹配当前进度。
6. 承诺与节奏：上一轮答应的事有没有做；是否连续多轮原地打转。

【工具】
- 只有需要核对“考纲要求 / 真题考法 / 知识点原文”时才调用，最多 2 次。
- 可用：search_question_bank（历年真题）、search_knowledge（教材知识点）、get_syllabus（2027 大纲）、get_learner_profile、get_learning_roadmap。
- 不要调用出题或改路线的工具。

【输出格式】
- 没问题：只输出 PASS
- 有问题：输出两行
REVISE
问题：一句话说清最关键的问题（引用学生或老师的原话）
要求：下一版必须做到的一件具体、可验证的事
- 只提一个最关键的问题；不要写讲解、不要替老师给答案。
- 意见学生可能看到，措辞专业、克制。

最后一条【老师】是待审草稿。不要复述学生的话，不要输出 PASS/REVISE 之外的内容。`;

const SUPERVISOR_TOOL_NAMES = new Set([
  "search_question_bank",
  "search_knowledge",
  "get_syllabus",
  "get_learner_profile",
  "get_learning_roadmap",
]);

const SUPERVISOR_TOOLS: ToolDefinition[] = TUTOR_TOOLS.filter(
  tool => SUPERVISOR_TOOL_NAMES.has(tool.function.name),
);

const REVIEW_TIMEOUT_MS = 8000;

export interface SupervisionVerdict {
  verdict: "pass" | "revise";
  /** Full review text, including the leading REVISE line. */
  critique?: string;
  skipped?: boolean;
}

function stripCitations(text: string): string {
  return text.replace(/\[\[S\d+\]\]/g, "").trim();
}

function quizBlock(userId: string, row: TutorMessage): string {
  const quiz = row.quiz;
  if (!quiz) return "";
  const answer = getTutorQuizRaw(quiz.id, userId)?.answer || "";
  const options = (quiz.options || []).map(option => `${option.key}. ${option.text}`).join("\n");
  return `【老师】[出了一道题：${quiz.topic || quiz.chapter || "巩固题"} · ${quiz.difficulty}]\n${quiz.stem}\n${options}${answer ? `\n答案：${answer}` : ""}`;
}

function checkBlock(userId: string, row: TutorMessage): string {
  const check = row.check;
  if (!check) return "";
  const answer = getTutorCheckRaw(check.id, userId)?.answer || "";
  return `【老师】[检查题]\n${check.prompt}${answer ? `\n参考答案：${answer}` : ""}`;
}

function renderRow(userId: string, row: TutorMessage): string {
  if (row.role === "tool") return "";
  if (row.role === "system") return row.content;
  if (row.role === "assistant" && row.toolCalls?.length && !row.content) return "";
  if (row.actor === "system") return row.content;
  if (row.role === "user") return `【学生】${row.content}`;
  if (row.quiz) return quizBlock(userId, row);
  if (row.check) return checkBlock(userId, row);
  const text = stripCitations(row.content);
  return text ? `【老师】${text}` : "";
}

/**
 * Supervisor view: one user message per review unit (dialogue since the last
 * review, ending with the draft), then the supervisor's own reply. Built from
 * immutable rows, so older units never change and the prefix stays cached.
 */
export function buildSupervisorMessages(userId: string, history: TutorMessage[]): ChatMessageInput[] {
  const out: ChatMessageInput[] = [{ role: "system", content: SUPERVISOR_SYSTEM }];
  let unit: string[] = [];

  const flush = (review?: string) => {
    if (unit.length) {
      out.push({ role: "user", content: unit.join("\n\n") });
      unit = [];
    }
    if (review) out.push({ role: "assistant", content: review });
  };

  for (const row of history) {
    if (row.actor === "supervisor") {
      flush(row.content);
      continue;
    }
    const block = renderRow(userId, row);
    if (block) unit.push(block);
  }
  flush();
  return out;
}

function parseVerdict(text: string): SupervisionVerdict {
  const clean = text.trim();
  if (/^PASS\b/i.test(clean)) return { verdict: "pass" };
  const match = clean.match(/^REVISE\b[：:]?\s*([\s\S]+)$/i);
  if (match) {
    const body = match[1].trim();
    if (body) return { verdict: "revise", critique: `REVISE\n${body}` };
  }
  // Fail open: an unparseable review must never block the teacher.
  return { verdict: "pass", skipped: true };
}

/** One review, at most two tool rounds, hard 8s budget. */
export async function reviewTutorDraft(input: {
  userId: string;
  conversationId: string;
  history: TutorMessage[];
}): Promise<SupervisionVerdict> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REVIEW_TIMEOUT_MS);
  try {
    const messages = buildSupervisorMessages(input.userId, input.history);
    for (let round = 0; round < 3; round++) {
      const result = await streamChatWithTools(
        messages,
        SUPERVISOR_TOOLS,
        () => { /* reviewers do not stream */ },
        { maxTokens: 600, temperature: 0.2, effort: "medium", signal: controller.signal },
      );
      if (!result.toolCalls.length) return parseVerdict(result.text);

      messages.push({ role: "assistant", content: result.text || null, tool_calls: result.toolCalls });
      const sources = createTutorSourceCollector();
      for (const call of result.toolCalls) {
        const name = call.function?.name || "";
        if (!SUPERVISOR_TOOL_NAMES.has(name)) {
          messages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify({ error: "该工具不在督导权限内" }) });
          continue;
        }
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function.arguments || "{}"); } catch { /* empty args */ }
        let output: unknown;
        try {
          output = (await executeTutorTool(name, args, {
            userId: input.userId,
            conversationId: input.conversationId,
            sources,
          })).result;
        } catch (err) {
          output = { error: err instanceof Error ? err.message : "工具执行失败" };
        }
        messages.push({ role: "tool", tool_call_id: call.id, name, content: JSON.stringify(output) });
      }
      messages.push({ role: "user", content: "请直接给出结论：PASS，或 REVISE 加问题与要求。" });
    }
    return { verdict: "pass", skipped: true };
  } catch {
    return { verdict: "pass", skipped: true };
  } finally {
    clearTimeout(timer);
  }
}

/** Review text without the leading REVISE line, for prompts and the UI. */
export function reviewBody(critique: string): string {
  return critique.replace(/^REVISE\b[：:]?\s*/i, "").trim();
}
