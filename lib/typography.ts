// 排版偏好:课程正文字体 / 全局字号 / 阅读宽度,持久化到 localStorage 并应用到 html[data-*]

const TYPE_KEY = "fcl-typography";

export interface TypographyPref {
  /** 课程正文字体:default | serif | mono */
  font: "default" | "serif" | "mono";
  /** 全局字号:small | default | large */
  size: "small" | "default" | "large";
  /** 阅读宽度:narrow | default | wide */
  width: "narrow" | "default" | "wide";
}

export const DEFAULT_TYPOGRAPHY: TypographyPref = {
  font: "default",
  size: "default",
  width: "default",
};

export function getTypography(): TypographyPref {
  try {
    const raw = localStorage.getItem(TYPE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<TypographyPref>;
      const font = p.font === "serif" || p.font === "mono" ? p.font : "default";
      const size = p.size === "small" || p.size === "large" ? p.size : "default";
      const width = p.width === "narrow" || p.width === "wide" ? p.width : "default";
      return { font, size, width };
    }
  } catch {
    // 存储不可用时使用默认值
  }
  return DEFAULT_TYPOGRAPHY;
}

export function setTypography(t: TypographyPref): void {
  try {
    localStorage.setItem(TYPE_KEY, JSON.stringify(t));
  } catch {
    // 忽略存储异常
  }
  applyTypography();
}

export function applyTypography(): void {
  try {
    const t = getTypography();
    const html = document.documentElement;
    html.setAttribute("data-font", t.font);
    html.setAttribute("data-size", t.size);
    html.setAttribute("data-width", t.width);
  } catch {
    // 忽略异常
  }
}

/** 全局挂载一次:初始化排版偏好 */
export function initTypography(): void {
  applyTypography();
}
