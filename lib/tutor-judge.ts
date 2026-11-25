import { chatJson } from "./deepseek";

/**
 * Fill-in checks are judged by the model, not by string normalization.
 * Equivalent expressions, unit suffixes, and a student showing the
 * calculation alongside the answer must all be accepted.
 */
export async function judgeTutorCheckAnswer(input: {
  prompt: string;
  expected: string;
  response: string;
  context?: string;
}): Promise<boolean> {
  const expected = input.expected.trim();
  const context = input.context?.trim();
  const raw = await chatJson<{ correct?: boolean }>([
    {
      role: "system",
      content: `你是考研阅卷老师。判断学生对一道填空题的回答是否正确。
判定原则：
- 数学表达式可以等价变形；带计算过程但最终结果正确，算对。
- 允许不同写法、不同单位表达、常见同义词或术语后缀（例如“成组链接法”对“成组链接”）。
- 只有概念、数值、符号或结论存在实质错误时才判错。
- 不要因为格式与标准答案不同而判错。
- 如果标准答案为空，结合最近对话和题目语境独立判断。
只输出 JSON：{"correct":true|false}`,
    },
    {
      role: "user",
      content: `${context ? `【最近对话】\n${context}\n\n` : ""}【题目】${input.prompt}
【标准答案】${expected || "（未提供，请根据题目和最近对话判断）"}
【学生回答】${input.response}

只判断学生回答是否正确，输出 {"correct":true} 或 {"correct":false}。`,
    },
  ], { maxTokens: 1200, temperature: 0, timeoutMs: 60000, effort: "medium" });

  if (typeof raw.correct !== "boolean") throw new Error("阅卷模型没有返回有效结果");
  return raw.correct;
}
