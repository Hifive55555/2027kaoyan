"use client";

import ReactMarkdown from "react-markdown";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { cn } from "@/lib/utils";

/**
 * DeepSeek 等模型常输出 LaTeX 的 \(...\) / \[...\] 定界符，
 * 但 remark-math 只识别 $...$ / $$...$$。这里在 Markdown 解析前统一转换，
 * 同时跳过代码块和行内代码，避免误伤示例代码。
 */
function normalizeMath(input: string): string {
  const parts = input.split(/(```[\s\S]*?```|`[^`\n]*`)/g);
  return parts
    .map((part, i) => {
      if (i % 2 === 1) return part;
      return part
        .replace(/\\\[([\s\S]*?)\\\]/g, (_, body: string) => `\n$$\n${body.trim()}\n$$\n`)
        .replace(/\\\(([\s\S]*?)\\\)/g, (_, body: string) => `$${body.trim()}$`);
    })
    .join("");
}

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("md-body", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkCjkFriendly, remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-brand underline decoration-brand/30 underline-offset-4">
              {children}
            </a>
          ),
          img: ({ src, alt }) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={typeof src === "string" ? src : ""} alt={alt || "题图"} className="my-3 max-h-80 rounded-lg border border-line bg-surface object-contain" />
          ),
          table: ({ children }) => (
            <div className="my-4 overflow-x-auto rounded-lg border border-line">
              <table>{children}</table>
            </div>
          ),
          code: ({ className, children }) => {
            const isBlock = /language-/.test(className || "");
            if (isBlock) return <code className={className}>{children}</code>;
            return <code className="rounded bg-subtle px-1.5 py-0.5 font-mono text-[0.9em]">{children}</code>;
          },
        }}
      >
        {normalizeMath(children)}
      </ReactMarkdown>
    </div>
  );
}
