"use client";

import ReactMarkdown from "react-markdown";

export default function LessonView({ content }: { content: string }) {
  return (
    <div className="prose-course max-w-none">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
