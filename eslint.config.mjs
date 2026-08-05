import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Electron 主进程与打包脚本为 CommonJS,不适用前端 TS 规则
    "electron/**",
    "scripts/**",
    // 打包中间产物与运行时目录
    "server/**",
    "dist/**",
  ]),
]);

export default eslintConfig;
