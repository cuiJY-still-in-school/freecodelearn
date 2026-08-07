"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";

function CodeBlock({
  code,
  lang,
  children,
}: {
  code: string;
  lang: string;
  children: ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <pre className="group relative overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-1.5">
        <span className="font-mono text-[10px] font-medium uppercase tracking-wider text-white/40">
          {lang || "code"}
        </span>
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
          className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] text-white/70 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100 hover:bg-white/15 hover:text-white"
        >
          {copied ? "✓ 已复制" : "复制"}
        </button>
      </div>
      <code>{children}</code>
    </pre>
  );
}

/** 坏图兜底:AI 生成课程常含无效图片 URL,渲染失败时隐藏,不显示裂图 */
function SafeImg({ src, alt }: { src?: string | Blob | null; alt?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken || !src || typeof src !== "string") return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt ?? ""} onError={() => setBroken(true)} />
  );
}

export default function LessonView({ content }: { content: string }) {
  return (
    <div className="prose-course max-w-none">
      <ReactMarkdown
        rehypePlugins={[rehypeRaw]}
        components={{
          pre({ children }) {
            const codeEl = (children as {
              props?: { children?: unknown; className?: string };
            })?.props;
            const raw = codeEl?.children;
            const code = Array.isArray(raw)
              ? raw.join("")
              : String(raw ?? "");
            const lang = String(codeEl?.className ?? "")
              .replace(/^language-/, "")
              .trim();
            return <CodeBlock code={code} lang={lang}>{children}</CodeBlock>;
          },
          img({ src, alt }) {
            return <SafeImg src={src} alt={alt} />;
          },
          details({ children }) {
            return (
              <details className="mt-5 rounded-xl border border-line bg-bg-subtle px-4 py-3">
                {children}
              </details>
            );
          },
          summary({ children }) {
            return (
              <summary className="cursor-pointer select-none text-sm font-semibold text-accent">
                {children}
              </summary>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
