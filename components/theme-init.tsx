"use client";

import { useEffect } from "react";
import { initTheme } from "@/lib/theme";

/** 挂载时初始化主题(避免首帧闪烁,另在 head 内联脚本提前设置) */
export default function ThemeInit() {
  useEffect(() => initTheme(), []);
  return null;
}
