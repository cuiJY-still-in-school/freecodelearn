"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loadDraft, type OutlineDraft } from "@/lib/drafts";
import OutlineEditor from "@/components/outline-editor";

export default function OutlineDraftPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<OutlineDraft | null | "loading">("loading");
  useEffect(() => {
    const d = loadDraft();
    if (!d) {
      router.replace("/");
      return;
    }
    setDraft(d);
  }, [router]);
  if (draft === "loading" || !draft) {
    return <p className="p-10 text-center text-sm text-ink-soft">加载大纲…</p>;
  }
  return <OutlineEditor draft={draft} />;
}
