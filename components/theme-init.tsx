"use client";

import { useEffect } from "react";
import { initTheme } from "@/lib/theme";
import { initTypography } from "@/lib/typography";

/** 挂载时初始化主题与排版偏好(避免首帧闪烁,另在 head 内联脚本提前设置) */
export default function ThemeInit() {
  useEffect(() => {
    initTheme();
    initTypography();
  }, []);
  return null;
}
