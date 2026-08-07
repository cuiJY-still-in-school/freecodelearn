"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";

function CodeBlock({ code, children }: { code: string; children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  return (
    <pre className="group relative">
      <button
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
        title="复制代码"
        className="absolute right-2.5 top-2.5 z-10 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] text-white/70 opacity-0 transition group-hover:opacity-100 hover:bg-white/15 hover:text-white"
      >
        {copied ? "✓ 已复制" : "复制"}
      </button>
      <code>{children}</code>
    </pre>
  );
}

export default function LessonView({ content }: { content: string }) {
  return (
    <div className="prose-course max-w-none">
      <ReactMarkdown
        components={{
          pre({ children }) {
            const codeEl = (children as { props?: { children?: unknown } })
              ?.props?.children;
            const code = Array.isArray(codeEl)
              ? codeEl.join("")
              : String(codeEl ?? "");
            return <CodeBlock code={code}>{children}</CodeBlock>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
