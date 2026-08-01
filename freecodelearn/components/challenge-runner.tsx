"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";

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
function assert(cond, msg) {
  if (!cond) throw new Error(msg || "断言失败");
}
const __log = (...args) => __fcl.logs.push(args.map(a => { try { return typeof a === "string" ? a : JSON.stringify(a); } catch { return String(a); } }).join(" "));
window.console.log = __log;
window.onerror = (msg) => { __fcl.fatal = "脚本错误: " + msg; };
`;

const HARNESS_SUFFIX = `
parent.postMessage({ type: "fcl-result", result: __fcl }, "*");
`;

function escapeScript(code: string): string {
  return code.replace(/<\/script/gi, "<\\/script");
}

function escapeStyle(code: string): string {
  return code.replace(/<\/style/gi, "<\\/style");
}

export default function ChallengeRunner({
  starterCode,
  tests,
  solution,
  html,
  language,
  onPassed,
}: Props) {
  const [code, setCode] = useState(starterCode);
  const [result, setResult] = useState<TestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [timeoutMsg, setTimeoutMsg] = useState(false);
  const [showSolution, setShowSolution] = useState(false);
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settledRef = useRef(false);

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
  runRef.current = () => run();

  const isCSS = /css|html/i.test(language ?? "");
  const isJS = /javascript/i.test(language ?? "");
  const isText = !isCSS && !isJS;

  const handleMessage = useCallback(
    (e: MessageEvent) => {
      if (e.data?.type !== "fcl-result") return;
      if (timerRef.current) clearTimeout(timerRef.current);
      setRunning(false);
      setResult(e.data.result as TestResult);
      settledRef.current = true;
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
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  function run() {
    if (!tests) return;
    setResult(null);
    setTimeoutMsg(false);
    setRunning(true);
    settledRef.current = false;

    // CSS/HTML 挑战:用户代码作为 <style> 注入,html 字段作为测试页面 DOM
    // 其他语言(Shell/Git/SQL 等):用户输入注入为 __fcl_input 字符串,测试用字符串断言
    let body: string;
    if (isCSS) {
      body = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
${escapeStyle(code)}
</style>
</head><body>
${html ?? ""}
<script>
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
const __fcl_input = ${JSON.stringify(code)};
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
${HARNESS_PREFIX}
try {
${escapeScript(code)}
${escapeScript(tests)}
} catch (e) {
  __fcl.fatal = "代码执行出错: " + String((e && e.message) || e);
}
${HARNESS_SUFFIX}
<\/script>
</body></html>`;
    }

    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.srcdoc = body;

    timerRef.current = setTimeout(() => {
      if (!settledRef.current) {
        setRunning(false);
        setTimeoutMsg(true);
        iframe.srcdoc = "";
      }
    }, 5000);
  }

  function reset() {
    setCode(starterCode);
    setResult(null);
    setTimeoutMsg(false);
    setShowSolution(false);
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
            disabled={running}
            className="rounded-lg bg-ink px-4 py-1.5 text-xs font-semibold text-bg transition hover:bg-accent disabled:opacity-50"
            title="快捷键:Ctrl + Enter"
          >
            {running ? "运行中..." : "运行测试 ⌘⏎"}
          </button>
        </div>
      </div>
      <CodeMirror
        value={code}
        onChange={setCode}
        height="260px"
        theme="dark"
        extensions={isCSS ? [css()] : isJS ? [javascript()] : []}
        basicSetup={{ autocompletion: false }}
        className="text-sm"
      />
      <iframe ref={iframeRef} className="hidden" title="test-runner" />

      {timeoutMsg && (
        <div className="border-t border-red/20 bg-red-soft px-5 py-3 text-sm text-red">
          运行超时(可能陷入死循环)。请检查代码后重试。
        </div>
      )}

      {result && !timeoutMsg && (
        <div className="border-t border-line">
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
                className="absolute right-2 top-2 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[10px] text-white/70 transition hover:bg-white/15 hover:text-white"
              >
                {copied ? "✓ 已复制" : "复制"}
              </button>
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
