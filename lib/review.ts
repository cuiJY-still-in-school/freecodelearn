// Leitner 间隔复习调度:每道 quiz 题目按答对/答错升降箱,到期提醒复习
// key 形如 `${stepId}:${qIndex}`;仅在题目所在步骤已学完后参与调度

export interface ReviewItem {
  box: number; // 1-5,箱号越高复习间隔越长
  dueAt: number; // 到期时间戳(ms)
}

// 各箱复习间隔:6 小时 / 1 天 / 3 天 / 7 天 / 14 天
const INTERVALS_MS = [6, 24, 72, 168, 336].map((h) => h * 3600_000);

const reviewKey = (courseId: string) => `fcl-review-${courseId}`;

export function loadReview(courseId: string): Record<string, ReviewItem> {
  try {
    const raw = localStorage.getItem(reviewKey(courseId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function recordAnswer(
  courseId: string,
  key: string,
  correct: boolean
): void {
  try {
    const map = loadReview(courseId);
    const cur = map[key];
    const box = correct ? Math.min(5, (cur?.box ?? 0) + 1) : 1;
    map[key] = { box, dueAt: Date.now() + INTERVALS_MS[box - 1] };
    localStorage.setItem(reviewKey(courseId), JSON.stringify(map));
  } catch {
    // 存储不可用时静默跳过
  }
}

/** 到期且所学过的复习项:key 列表(stepId:qIndex),按到期先后排序 */
export function dueReviewKeys(
  courseId: string,
  progress: Record<string, unknown>
): string[] {
  const map = loadReview(courseId);
  const now = Date.now();
  return Object.entries(map)
    .filter(([, v]) => v.dueAt <= now)
    .map(([k]) => k)
    .filter((k) => {
      const stepId = k.slice(0, k.lastIndexOf(":"));
      return stepId && Boolean(progress[stepId]);
    })
    .sort((a, b) => map[a].dueAt - map[b].dueAt);
}
