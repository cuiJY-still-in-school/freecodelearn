// 学习活动统计:每日完成步数 / 连续学习天数(按本地时区)

const ACTIVITY_KEY = "fcl-activity";

export const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

function load(): Record<string, number> {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** 完成一步时记录(按当日日期累计) */
export function logCompletion(): void {
  try {
    const map = load();
    const today = dayKey(new Date());
    map[today] = (map[today] ?? 0) + 1;
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(map));
  } catch {
    // 存储不可用时静默跳过
  }
}

export function todaySteps(): number {
  return load()[dayKey(new Date())] ?? 0;
}

export function totalSteps(): number {
  return Object.values(load()).reduce((a, b) => a + b, 0);
}

/** 连续学习天数:今天没学则从昨天起算(允许「今天还没开始」) */
export function streakDays(): number {
  const map = load();
  const cursor = new Date();
  if (!map[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while ((map[dayKey(cursor)] ?? 0) > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
