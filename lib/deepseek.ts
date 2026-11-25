const BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";
const EFFORT = process.env.DEEPSEEK_EFFORT || "low";
export type ReasoningEffort = "low" | "medium" | "high" | "max";

export interface ChatMessageInput {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
}

export class DeepSeekError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = "DeepSeekError";
    this.status = status;
  }
}

function apiKey(): string {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new DeepSeekError("缺少 DEEPSEEK_API_KEY，请在 .env.local 中配置", 500);
  return key;
}

export async function chatJson<T>(
  messages: ChatMessageInput[],
  opts: { maxTokens?: number; temperature?: number; timeoutMs?: number; effort?: ReasoningEffort } = {}
): Promise<T> {
  const maxTokens = opts.maxTokens ?? 12000;
  const temperature = opts.temperature ?? 0.7;
  const timeoutMs = opts.timeoutMs ?? 180000;
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey()}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages,
          temperature,
          max_tokens: maxTokens,
          reasoning_effort: opts.effort ?? EFFORT,
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new DeepSeekError(`DeepSeek ${res.status}: ${body.slice(0, 500)}`, res.status);
      }
      const data = await res.json();
      const content: string = data.choices?.[0]?.message?.content || "";
      try {
        return parseJsonLoose<T>(content);
      } catch (parseErr) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[deepseek] JSON parse failed; raw content:", content.slice(0, 3000));
        }
        throw parseErr;
      }
    } catch (err) {
      lastError = err;
      const status = err instanceof DeepSeekError ? err.status : undefined;
      if (status === 401 || status === 403) break;
      if (attempt < 2) await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new DeepSeekError(String(lastError));
}

export function parseJsonLoose<T>(text: string): T {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try {
    return JSON.parse(s) as T;
  } catch (err) {
    // common repair: trailing commas
    const repaired = s.replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(repaired) as T;
  }
}

export async function streamChat(
  messages: ChatMessageInput[],
  onDelta: (delta: string) => void,
  opts: { maxTokens?: number; temperature?: number; signal?: AbortSignal; effort?: ReasoningEffort } = {}
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.maxTokens && opts.maxTokens > 8000 ? 240000 : 120000);
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener("abort", onAbort);
  let full = "";
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey()}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: opts.temperature ?? 0.6,
        max_tokens: opts.maxTokens ?? 4000,
        reasoning_effort: opts.effort ?? EFFORT,
        stream: true,
      }),
    });
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw new DeepSeekError(`DeepSeek ${res.status}: ${body.slice(0, 500)}`, res.status);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content || "";
          if (delta) { full += delta; onDelta(delta); }
        } catch { /* ignore keepalive */ }
      }
    }
    return full;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

export const MODEL_NAME = MODEL;
