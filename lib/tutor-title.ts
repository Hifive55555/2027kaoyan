import { chatJson } from "./deepseek";

const TITLE_SYSTEM = `你是对话标题生成器。根据第一轮师生对话，给这段学习对话起一个简洁、可检索的标题。

要求：
- 4–12 个汉字，最多 20 个字符。
- 点明学科、知识点或本轮动作，例如“C-SCAN 磁头移动”“文件打开流程”。
- 不要引号、书名号、句号、感叹号。
- 不要使用“新对话、学习、答疑、对话、提问、继续”等空泛词。
- 只输出 JSON，格式为 {"title":"标题"}`;

export async function generateTutorConversationTitle(
  userMessage: string,
  assistantMessage: string,
): Promise<string | null> {
  const user = String(userMessage || "").replace(/\s+/g, " ").trim().slice(0, 1200);
  if (!user) return null;
  const assistant = String(assistantMessage || "").replace(/\s+/g, " ").trim().slice(0, 1200);
  const raw = await chatJson<{ title?: string }>(
    [
      { role: "system", content: TITLE_SYSTEM },
      {
        role: "user",
        content: `学生：${user}\n\n老师：${assistant || "（本轮只发了题目）"}`,
      },
    ],
    { maxTokens: 512, temperature: 0.2, timeoutMs: 8000, effort: "low" },
  );
  const title = String(raw?.title || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/[“”"'《》【】]/g, "")
    .replace(/[。！？!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
  if (title.length < 2 || /^(新的对话|新对话|学习|答疑|对话|提问)$/.test(title)) return null;
  return title;
}
