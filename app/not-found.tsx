import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <span className="font-serif text-7xl font-bold text-accent">404</span>
      <h1 className="mt-4 font-serif text-2xl font-bold">页面不存在</h1>
      <p className="mt-2 text-sm text-ink-soft">
        课程可能已被删除,或链接有误
      </p>
      <Link
        href="/"
        className="mt-6 rounded-xl bg-ink px-6 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent"
      >
        ← 回到课程列表
      </Link>
    </div>
  );
}
