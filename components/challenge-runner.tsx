"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import {
  extractEditableCode,
  sanitizeEditableMarks,
} from "@/lib/types";

export interface TestResult {
  passed: string[];
  failed: { name: string; error: string }[];
  fatal: string | null;
  logs: string[];
}

interface Props {
  starterCode: string;
  tests?: string;
  solution?: string;
  html?: string;
  language?: string;
  seedBefore?: string;
  seedAfter?: string;
  /** 3 级提示梯:先独立尝试(≥2 次失败)再逐级解锁,保护「生产性挣扎」 */
  hints?: string[];
  /** 课程声明的终端白名单扩展/禁用 */
  allowedCommands?: string[];
  blockedCommands?: string[];
  /** 编辑器内容持久化键(课程+步骤):切走/刷新后不丢已写代码 */
  persistKey?: string;
  onPassed?: () => void;
}

const HARNESS_PREFIX = `const __fcl = { passed: [], failed: [], fatal: null, logs: [] };
function test(name, fn) {
  try {
    fn();
    __fcl.passed.push(name);
  } catch (e) {
    __fcl.failed.push({ name: name, error: String((e && e.message) || e) });
  }
}
const assert = Object.assign(
  function (cond, msg) {
    if (!cond) throw new Error(msg || "断言失败");
  },
  {
    ok: (v, m) => { if (!v) throw new Error(m || "expected truthy value"); },
    isTrue: (v, m) => { if (v !== true) throw new Error(m || "expected true"); },
    isFalse: (v, m) => { if (v !== false) throw new Error(m || "expected false"); },
    equal: (a, b, m) => { if (a !== b) throw new Error(m || ("expected " + JSON.stringify(a) + " to equal " + JSON.stringify(b))); },
    notEqual: (a, b, m) => { if (a === b) throw new Error(m || ("expected " + JSON.stringify(a) + " not to equal " + JSON.stringify(b))); },
    exists: (v, m) => { if (v == null) throw new Error(m || "expected value to exist"); },
    isFunction: (v, m) => { if (typeof v !== "function") throw new Error(m || "expected a function"); },
    lengthOf: (v, n, m) => { if (!v || v.length !== n) throw new Error(m || ("expected length " + (v ? v.length : "undefined") + " to equal " + n)); },
    match: (s, re, m) => { if (!re.test(s)) throw new Error(m || ("expected string to match " + re)); },
    notMatch: (s, re, m) => { if (re.test(s)) throw new Error(m || ("expected string not to match " + re)); },
    include: (s, sub, m) => { if (!String(s).includes(sub)) throw new Error(m || ("expected string to include " + JSON.stringify(sub))); },
    notInclude: (s, sub, m) => { if (String(s).includes(sub)) throw new Error(m || ("expected string not to include " + JSON.stringify(sub))); }
  }
);
const __log = (...args) => __fcl.logs.push(args.map(a => { try { return typeof a === "string" ? a : JSON.stringify(a); } catch { return String(a); } }).join(" "));
window.console.log = __log;
window.onerror = (msg) => { __fcl.fatal = "脚本错误: " + msg; };
`;

const HARNESS_SUFFIX = `
parent.postMessage({ type: "fcl-result", runId: window.__fcl_runId, result: __fcl }, "*");
`;

function escapeScript(code: string): string {
  return code.replace(/<\/script/gi, "<\\/script");
}

export default function ChallengeRunner({
  starterCode,
  tests,
  solution,
  html,
  language,
  seedBefore,
  seedAfter,
  hints,
  allowedCommands,
  blockedCommands,
  persistKey,
  onPassed,
}: Props) {
  const initial = !seedBefore && !seedAfter
    ? (starterCode ?? "")
    : `${seedBefore ?? ""}\n--fcc-editable-region--\n${starterCode ?? ""}\n--fcc-editable-region--\n${seedAfter ?? ""}`;
  const [code, setCode] = useState(initial);
  // 已写代码持久化:hydration 后从 localStorage 恢复(切换步骤/刷新不丢)
  useEffect(() => {
    if (!persistKey) return;
    try {
      const saved = localStorage.getItem(`fcl-editor-${persistKey}`);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载后一次性恢复持久化代码,仅一次
      if (saved != null) setCode(saved);
    } catch {
      // 存储不可用时静默跳过
    }
  }, [persistKey]);
  const [result, setResult] = useState<TestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [timeoutMsg, setTimeoutMsg] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [copied, setCopied] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [hintsShown, setHintsShown] = useState(0);
  const [terminalOutput, setTerminalOutput] = useState("");
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settledRef = useRef(false);
  const runningRef = useRef(false);
  // 运行序号:每次 run 递增,iframe 结果消息携带该序号,过期结果丢弃
  const runIdRef = useRef(0);
  const hasSeed = Boolean(seedBefore || seedAfter);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runRef.current?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    // 每次渲染后把最新 run 挂到 ref,供 Ctrl+Enter 快捷键调用
    runRef.current = () => run();
  });

  const isHTML = /html/i.test(language ?? "");
  const isCSS = !isHTML && /css/i.test(language ?? "");
  const isJS = /javascript/i.test(language ?? "");
  const isText = !isHTML && !isCSS && !isJS;
  // 命令行/终端类语言(Shell/Git 等):可在本机真实执行并回显输出
  const isTerminalLang = isText && /shell|git|bash|zsh|powershell|cmd|命令行|终端|命令/i.test(language ?? "");

  // 快捷键提示按平台显示(Cmd / Ctrl)
  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent || "");
  const runHint = isMac ? "⌘⏎" : "Ctrl+⏎";

  const handleMessage = useCallback(
    (e: MessageEvent) => {
      if (e.data?.type !== "fcl-result") return;
      // 只接受当前 iframe、当前运行序号的结果,丢弃过期/伪造消息
      if (e.source !== iframeRef.current?.contentWindow) return;
      if (e.data.runId !== runIdRef.current) return;
      if (timerRef.current) clearTimeout(timerRef.current);
      runningRef.current = false;
      setRunning(false);
      setResult(e.data.result as TestResult);
      settledRef.current = true;
      // 判题结果滚动到可视区(长代码编辑场景结果可能在屏幕外)
      window.setTimeout(() => {
        resultRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 60);
      if (
        e.data.result &&
        e.data.result.failed?.length === 0 &&
        !e.data.result.fatal
      ) {
        onPassed?.();
      }
    },
    [onPassed]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [handleMessage]);

  async function run() {
    if (!tests) return;
    // 防重入:运行中忽略再次触发(含 Ctrl+Enter 快捷键)
    if (runningRef.current) return;
    runningRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    setResult(null);
    setTimeoutMsg(false);
    setRunning(true);
    settledRef.current = false;
    setAttempts((n) => n + 1);
    const runId = ++runIdRef.current;

    // 编辑区代码(用户实际改动部分):freeCodeCamp 的 code 变量,测试可用正则/字符串断言
    const editable = extractEditableCode(code);

    // 命令行/终端类挑战(桌面版):把用户输入的命令真实执行,回显终端输出
    let termOut = "";
    if (isTerminalLang && typeof window !== "undefined") {
      const term = (window as unknown as {
        fclTerminal?: {
          exec(
            c: string,
            extra?: { allowed?: string[]; blocked?: string[] }
          ): Promise<{ stdout?: string; stderr?: string; error?: string; code?: number }>;
        };
      }).fclTerminal;
      if (term) {
        const cmds = editable
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        const lines: string[] = [];
        const extra = {
          allowed: allowedCommands ?? [],
          blocked: blockedCommands ?? [],
        };
        for (const c of cmds) {
          lines.push(`$ ${c}`);
          try {
            const r = await term.exec(c, extra);
            if (r?.stdout?.trim()) lines.push(r.stdout.replace(/\n$/, ""));
            if (r?.stderr) lines.push(r.stderr);
            if (r?.error) lines.push(r.error);
            if (r && r.code) lines.push(`(exit code ${r.code})`);
          } catch (err) {
            lines.push(
              `(命令执行出错:${err instanceof Error ? err.message : String(err)})`
            );
          }
        }
        termOut = lines.join("\n");
        setTerminalOutput(termOut);
      }
    }

    let body: string;
    if (isCSS) {
      // CSS 挑战:编辑区内容作为 <style> 注入,html 字段为测试页面 DOM
      body = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${escapeScript(sanitizeEditableMarks(code, true))}
</style>
</head><body>
${html ?? ""}
<script>
const __fcl_code = ${JSON.stringify(editable)};
const code = __fcl_code;
${HARNESS_PREFIX}
try {
${escapeScript(tests)}
} catch (e) {
  __fcl.fatal = "测试执行出错: " + String((e && e.message) || e);
}
${HARNESS_SUFFIX}
<\/script>
</body></html>`;
    } else if (isHTML) {
      // HTML 挑战:拼接的文档直接渲染,html 字段作为固定前置结构,编辑区可被 document 与 code 断言
      body = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>body { font-family: system-ui, sans-serif; }</style>
</head><body>
${html ?? ""}
${escapeScript(sanitizeEditableMarks(code, false))}
<script>
const __fcl_code = ${JSON.stringify(editable)};
const code = __fcl_code;
${HARNESS_PREFIX}
try {
${escapeScript(tests)}
} catch (e) {
  __fcl.fatal = "测试执行出错: " + String((e && e.message) || e);
}
${HARNESS_SUFFIX}
<\/script>
</body></html>`;
    } else if (isText) {
      body = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<script>
const __fcl_input = ${JSON.stringify(editable)};
const code = __fcl_input;
${HARNESS_PREFIX}
try {
${escapeScript(tests)}
} catch (e) {
  __fcl.fatal = "测试执行出错: " + String((e && e.message) || e);
}
${HARNESS_SUFFIX}
<\/script>
</body></html>`;
    } else {
      body = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
${html ?? ""}
<script>
const __fcl_code = ${JSON.stringify(editable)};
const code = __fcl_code;
${HARNESS_PREFIX}
${escapeScript(sanitizeEditableMarks(code, true))}
try {
${escapeScript(tests)}
} catch (e) {
  __fcl.fatal = "测试执行出错: " + String((e && e.message) || e);
}
${HARNESS_SUFFIX}
<\/script>
</body></html>`;
    }

    const iframe = iframeRef.current;
    if (!iframe) {
      runningRef.current = false;
      setRunning(false);
      return;
    }
    // 把本次运行序号注入 iframe,结果消息回传时携带
    iframe.srcdoc = body.replace(
      "<script>",
      `<script>window.__fcl_runId = ${runId};`
    );

    timerRef.current = setTimeout(() => {
      if (!settledRef.current) {
        runningRef.current = false;
        setRunning(false);
        setTimeoutMsg(true);
        iframe.srcdoc = "";
      }
    }, 5000);
  }

  function reset() {
    // 已持久化的代码会被清空,先确认再重置
    if (persistKey) {
      try {
        const saved = localStorage.getItem(`fcl-editor-${persistKey}`);
        if (saved != null && saved !== initial) {
          if (!window.confirm("重置将清空你已写的代码并恢复初始内容,确定?")) return;
        }
        localStorage.removeItem(`fcl-editor-${persistKey}`);
      } catch {
        // 忽略存储异常
      }
    }
    runningRef.current = false;
    setRunning(false);
    setCode(initial);
    setResult(null);
    setTimeoutMsg(false);
    setShowSolution(false);
    setHintsShown(0);
    setTerminalOutput("");
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-line px-5 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          <span className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-green/60" />
          </span>
          {isText ? "答题区(输入你的命令或文本)" : "代码编辑器"}
        </span>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="rounded-lg border border-line px-3.5 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
          >
            重置
          </button>
          <button
            onClick={run}
            disabled={running || !tests}
            className="rounded-lg bg-ink px-4 py-1.5 text-xs font-semibold text-bg transition hover:bg-accent disabled:opacity-50"
            title={
              tests
                ? `快捷键:${isMac ? "Cmd" : "Ctrl"} + Enter`
                : "本题没有自动判题,直接阅读并完成下面的操作即可"
            }
          >
            {running ? "运行中..." : `运行测试 ${runHint}`}
          </button>
        </div>
      </div>
      <CodeMirror
        value={code}
        onChange={(v) => {
          setCode(v);
          if (persistKey) {
            try {
              localStorage.setItem(`fcl-editor-${persistKey}`, v);
            } catch {
              // 忽略存储异常
            }
          }
        }}
        height="260px"
        theme="dark"
        extensions={isCSS ? [css()] : isJS ? [javascript()] : []}
        basicSetup={{ autocompletion: false }}
        className="text-sm"
      />
      {hasSeed && (
        <div className="border-t border-line bg-bg-subtle px-5 py-2 text-[11px] text-ink-soft">
          <span className="font-mono">--fcc-editable-region--</span>
          <span className="mx-1">↔</span>
          <span className="font-mono">--fcc-editable-region--</span>
          之间的代码可以修改,其余为种子代码(无需改动)
        </div>
      )}
      {/* sandbox=allow-scripts:脚本可运行,但 opaque origin 无法访问父页面/本地数据 */}
      <iframe
        ref={iframeRef}
        className="hidden"
        title="test-runner"
        sandbox="allow-scripts"
      />

      {isTerminalLang && terminalOutput && (
        <div className="border-t border-line bg-[#0d1117]">
          <div className="flex items-center gap-1.5 border-b border-white/10 px-5 py-2 text-[11px] text-ink-soft/70">
            <span className="h-2.5 w-2.5 rounded-full bg-red/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400/60" />
            <span className="h-2.5 w-2.5 rounded-full bg-green/60" />
            终端输出(命令已在本机真实执行)
          </div>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-5 py-3 font-mono text-xs leading-relaxed text-green-400">
            {terminalOutput}
          </pre>
        </div>
      )}

      {timeoutMsg && (
        <div className="border-t border-red/20 bg-red-soft px-5 py-3 text-sm text-red">
          运行超时(可能陷入死循环)。请检查代码后重试。
        </div>
      )}

      {result && !timeoutMsg && (
        <div ref={resultRef} className="border-t border-line">
          {result.fatal ? (
            <div className="px-5 py-3 text-sm text-red">{result.fatal}</div>
          ) : (
            <div className="px-5 py-4">
              <div className="mb-2.5 flex items-center gap-2 text-sm">
                {result.failed.length === 0 ? (
                  <span className="pop font-semibold text-green">
                    ✓ 全部通过 ({result.passed.length} 个测试)
                  </span>
                ) : (
                  <span className="font-semibold text-red">
                    ✗ 通过 {result.passed.length}/{result.passed.length + result.failed.length}
                  </span>
                )}
              </div>
              {result.failed.map((f, i) => (
                <div
                  key={i}
                  className="mb-1.5 rounded-xl border border-red/20 bg-red-soft px-3.5 py-2 text-xs"
                >
                  <span className="font-medium text-red">{f.name}</span>
                  <span className="ml-2 text-red/70">{f.error}</span>
                </div>
              ))}
              {result.failed.length > 0 && (
                <div className="mt-2.5 text-xs text-ink-soft">
                  {attempts === 1
                    ? "别灰心,看看上面的失败提示再试一次 💪"
                    : `已经尝试了 ${attempts} 次,每一次都离答案更近一步,加油!`}
                </div>
              )}
              {result.failed.length === 0 && (
                <div className="flex items-center gap-1.5">
                  {result.passed.map((p) => (
                    <div
                      key={p}
                      className="h-1.5 flex-1 rounded-full bg-green/60"
                      title={p}
                    />
                  ))}
                </div>
              )}
              {result.failed.length === 0 && attempts > 1 && (
                <div className="mt-2.5 text-xs text-ink-soft">
                  第 {attempts} 次尝试通过,坚持就是胜利 🎉
                </div>
              )}
            </div>
          )}
          {result.logs.length > 0 && (
            <div className="border-t border-line px-5 py-2.5">
              <div className="mb-1 text-xs text-ink-soft">控制台输出:</div>
              {result.logs.map((l, i) => (
                <pre key={i} className="font-mono text-xs text-ink">
                  {l}
                </pre>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 提示梯:失败 ≥2 次后解锁,逐级揭示,先独立挣扎再求助 */}
      {hints && hints.length > 0 && result && !timeoutMsg && result.failed.length > 0 && (
        <div className="border-t border-line px-5 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-medium text-ink-soft">
              {hintsShown > 0 ? "提示逐级解锁中" : "卡住了?提示可以帮你找到方向"}
            </span>
            {hintsShown < hints.length ? (
              <button
                onClick={() => setHintsShown((h) => h + 1)}
                disabled={attempts < 2}
                className="rounded-lg border border-amber/40 bg-amber-soft px-3.5 py-1.5 text-xs font-semibold text-amber-deep transition hover:bg-amber-soft disabled:cursor-not-allowed disabled:opacity-40"
              >
                💡 查看提示 {hintsShown + 1}/{hints.length}
              </button>
            ) : (
              <span className="text-[11px] text-ink-soft">提示已全部显示,再想想怎么改</span>
            )}
          </div>
          {attempts < 2 && (
            <p className="mt-1.5 text-[11px] text-ink-soft">
              再独立尝试 {2 - attempts} 次即可解锁提示——先自己想,学得更牢
            </p>
          )}
          {hints.slice(0, hintsShown).map((h, i) => (
            <div
              key={i}
              className="fade-up mt-2 rounded-xl border border-amber/30 bg-amber-soft px-3.5 py-2 text-xs leading-relaxed text-amber-deep"
            >
              <span className="font-bold text-amber-700">提示 {i + 1}:</span> {h}
            </div>
          ))}
        </div>
      )}

      {solution && (
        <div className="border-t border-line px-5 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-ink-soft">
              {showSolution ? "参考答案" : "卡住了?可以看看参考答案"}
            </span>
            {showSolution && (
              <button
                onClick={() => setShowSolution(false)}
                className="text-xs text-ink-soft transition hover:text-ink"
              >
                收起
              </button>
            )}
          </div>
          {showSolution ? (
            <div className="relative">
              <pre className="overflow-x-auto rounded-xl bg-[#1f1e1d] p-4 font-mono text-xs text-[#e8e6e1]">
                {solution}
              </pre>
              <div className="absolute right-2 top-2 flex gap-1.5">
                <button
                  onClick={() => {
                    // 种子模式下答案只含编辑区部分,需保留种子骨架
                    setCode(
                      hasSeed
                        ? `${seedBefore ?? ""}\n--fcc-editable-region--\n${solution}\n--fcc-editable-region--\n${seedAfter ?? ""}`
                        : solution
                    );
                    setResult(null);
                    setTimeoutMsg(false);
                    setShowSolution(false);
                  }}
                  title="把答案填入编辑器,自己运行体会"
                  className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] text-white/70 transition hover:bg-white/15 hover:text-white"
                >
                  填入编辑器
                </button>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(solution);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    } catch {
                      setCopied(false);
                    }
                  }}
                  className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] text-white/70 transition hover:bg-white/15 hover:text-white"
                >
                  {copied ? "✓ 已复制" : "复制"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowSolution(true)}
              className="rounded-lg border border-line px-3.5 py-1.5 text-xs font-medium text-ink-soft transition hover:bg-bg-subtle hover:text-ink"
            >
              查看参考答案
            </button>
          )}
        </div>
      )}
    </div>
  );
}
