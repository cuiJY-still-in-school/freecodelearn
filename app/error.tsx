"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <span className="text-4xl">😵</span>
      <h1 className="mt-4 font-serif text-2xl font-bold">出了点问题</h1>
      <p className="mt-2 max-w-md text-sm text-ink-soft">
        {error.message || "页面加载失败,请重试"}
      </p>
      <button
        onClick={reset}
        className="mt-6 rounded-xl bg-ink px-6 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent"
      >
        重试
      </button>
    </div>
  );
}
