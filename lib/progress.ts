"use client";

const KEY = (courseId: string) => `fcl-progress-${courseId}`;

export type ProgressMap = Record<string, "done" | "passed" | "correct">;

export function loadProgress(courseId: string): ProgressMap {
  try {
    const raw = localStorage.getItem(KEY(courseId));
    return raw ? (JSON.parse(raw) as ProgressMap) : {};
  } catch {
    return {};
  }
}

export function saveProgress(
  courseId: string,
  progress: ProgressMap
): void {
  try {
    localStorage.setItem(KEY(courseId), JSON.stringify(progress));
  } catch {
    // storage full or unavailable
  }
}
