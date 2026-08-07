// 主题:浅色/深色/跟随系统,持久化到 localStorage 并应用到 html[data-theme]
// "system" 时监听 prefers-color-scheme 变化

const THEME_KEY = "fcl-theme";
export type Theme = "system" | "dark" | "light";

export function getTheme(): Theme {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === "dark" || t === "light" || t === "system") return t;
  } catch {
    // 存储不可用时默认跟随系统
  }
  return "system";
}

export function setTheme(t: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, t);
  } catch {
    // 忽略存储异常
  }
  applyTheme();
}

export function applyTheme(): void {
  try {
    const t = getTheme();
    const dark =
      t === "dark" ||
      (t === "system" &&
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  } catch {
    // 忽略异常
  }
}

/** 全局挂载一次:初始化主题并跟随系统变化 */
export function initTheme(): () => void {
  applyTheme();
  let mq: MediaQueryList | null = null;
  try {
    mq = window.matchMedia?.("(prefers-color-scheme: dark)") ?? null;
    if (mq) mq.addEventListener("change", applyTheme);
  } catch {
    mq = null;
  }
  return () => {
    try {
      mq?.removeEventListener("change", applyTheme);
    } catch {
      // 忽略
    }
  };
}
