"use client";

import { useEffect, useState } from "react";

function parseVersion(tag: string): string {
  return tag.replace(/^v/, "").replace(/-[a-zA-Z0-9-]+$/, "");
}

function isNewer(remote: string, cur: string): boolean {
  const pa = remote.split(".").map(Number);
  const pb = cur.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}

export default function UpdateBanner({ current }: { current: string }) {
  const [update, setUpdate] = useState<{ version: string; url: string } | null>(
    null
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("https://api.github.com/repos/cuiJY-still-in-school/freecodelearn/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d?.tag_name || !d?.html_url) return;
        const v = parseVersion(String(d.tag_name));
        if (!isNewer(v, current)) return;
        if (sessionStorage.getItem("fcl-update-dismissed") === v) return;
        setUpdate({ version: v, url: String(d.html_url) });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [current]);

  if (!update || dismissed) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-b border-accent/30 bg-accent-soft px-4 py-2 text-xs">
      <p className="text-ink">
        发现新版本 <span className="font-semibold text-accent">v{update.version}</span>
        (当前 v{current}),包含新功能与修复
      </p>
      <div className="flex shrink-0 items-center gap-3">
        <a
          href={update.url}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-accent px-3 py-1 font-medium text-white transition hover:opacity-90"
        >
          前往下载
        </a>
        <button
          onClick={() => {
            sessionStorage.setItem("fcl-update-dismissed", update.version);
            setDismissed(true);
          }}
          className="rounded-lg px-2 py-1 text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
          aria-label="忽略本次更新"
        >
          忽略
        </button>
      </div>
    </div>
  );
}
