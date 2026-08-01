import Link from "next/link";

export default function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent font-serif text-lg font-bold text-white shadow-sm">
            f
          </span>
          <span className="font-serif text-lg font-bold tracking-tight text-ink">
            FreeCode<span className="text-accent">Learn</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm text-ink-soft">
          <Link
            href="/"
            className="rounded-lg px-3 py-1.5 transition hover:bg-bg-subtle hover:text-ink"
          >
            课程
          </Link>
          <Link
            href="/settings"
            className="rounded-lg px-3 py-1.5 transition hover:bg-bg-subtle hover:text-ink"
          >
            设置
          </Link>
        </nav>
      </div>
    </header>
  );
}
