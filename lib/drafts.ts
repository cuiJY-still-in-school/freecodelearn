import type { CourseOutline } from "./types";
import type { AnalyzeResult, LearnerProfile } from "./chat";

export interface OutlineDraft {
  outline: CourseOutline;
  params: AnalyzeResult;
  profile?: LearnerProfile;
  createdAt: number;
}

const DRAFT_KEY = "fcl-outline-draft";

/** 保存大纲草稿(单草稿,覆盖写) */
export function saveDraft(draft: OutlineDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // 存储不可用时跳过
  }
}

/** 读取大纲草稿;不存在或已过期(7 天)返回 null */
export function loadDraft(): OutlineDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as OutlineDraft;
    if (!d?.outline || Date.now() - (d.createdAt ?? 0) > 7 * 24 * 3600 * 1000) return null;
    return d;
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 忽略
  }
}
