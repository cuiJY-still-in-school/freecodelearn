"use client";

import { useEffect, useState } from "react";
import type { QuizQuestion } from "@/lib/types";

interface Props {
  questions: QuizQuestion[];
  /** 本章核心概念标签(全部答对后的巩固横幅) */
  chapterConcepts?: string[];
  /** 每次提交时逐题回调(原题与错题重做均触发),用于间隔复习调度 */
  onReview?: (question: QuizQuestion, correct: boolean) => void;
  onComplete: () => void;
}

export default function QuizView({
  questions,
  chapterConcepts,
  onReview,
  onComplete,
}: Props) {
  // activeIdx 为 null 表示全部题目;错题重做时为错题下标数组
  const [activeIdx, setActiveIdx] = useState<number[] | null>(null);
  const shown = activeIdx ? activeIdx.map((i) => questions[i]) : questions;
  const [answers, setAnswers] = useState<(number | null)[]>(
    questions.map(() => null)
  );
  const [checked, setChecked] = useState(false);
  const [round, setRound] = useState(1);

  const allAnswered = shown.every((_, i) => answers[i] !== null);
  const score = checked
    ? shown.filter((q, i) => answers[i] === q.correctIndex).length
    : 0;
  const allCorrect = checked && score === shown.length;
  const wrongIdx = shown
    .map((_, i) => (answers[i] !== shown[i].correctIndex ? i : -1))
    .filter((i) => i >= 0);

  function check() {
    const correct = shown.filter(
      (q, i) => answers[i] === q.correctIndex
    ).length;
    setChecked(true);
    if (onReview) shown.forEach((q, i) => onReview(q, answers[i] === q.correctIndex));
    if (correct === shown.length) onComplete();
  }

  /** 重做答错的题:只保留错题,重置答案,继续间隔回忆 */
  function reworkWrong() {
    const wrong = activeIdx
      ? wrongIdx.map((wi) => activeIdx[wi])
      : wrongIdx;
    setActiveIdx(wrong);
    setAnswers(wrong.map(() => null));
    setChecked(false);
    setRound((r) => r + 1);
    window.setTimeout(
      () => document.querySelector("[data-quiz-top]")?.scrollIntoView({ behavior: "smooth" }),
      0
    );
  }

  // 键盘答题:1-9 选第一道未答之题的选项,Enter 提交
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (checked || shown.length === 0) return;
      if (e.key === "Enter") {
        if (allAnswered) check();
        return;
      }
      const n = /^[1-9]$/.test(e.key) ? Number(e.key) : 0;
      if (!n) return;
      const qi = answers.findIndex((a) => a === null);
      if (qi < 0) return;
      const opts = shown[qi]?.options ?? [];
      if (n <= opts.length)
        setAnswers((prev) => prev.map((a, i) => (i === qi ? n - 1 : a)));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 最新状态由闭包内的 check/answers 直接读取
  });

  return (
    <div className="space-y-5" data-quiz-top>
      {round > 1 && (
        <div className="fade-up rounded-xl border border-accent/30 bg-accent-soft px-4 py-2.5 text-xs text-accent">
          错题重做中:只显示你答错的 {shown.length} 题。全对即可通过,先想清楚再作答。
        </div>
      )}
      {shown.map((q, qi) => {
        const isWrong = checked && answers[qi] !== q.correctIndex;
        return (
          <div
            key={qi}
            data-testid={`quiz-q-${qi}`}
            className="rounded-2xl border border-line bg-card p-6 shadow-sm"
          >
            <p className="mb-4 font-medium text-ink">
              <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-bg-subtle font-mono text-xs text-ink-soft">
                {qi + 1}
              </span>
              {q.question}
            </p>
            <div className="space-y-2.5">
              {q.options.map((opt, oi) => {
                const selected = answers[qi] === oi;
                let cls =
                  "border-line bg-bg text-ink hover:border-accent/50 hover:bg-accent-soft/40";
                if (checked && oi === q.correctIndex)
                  cls = "border-green/50 bg-green-soft text-green";
                else if (checked && selected && isWrong)
                  cls = "border-red/50 bg-red-soft text-red";
                else if (checked && selected)
                  cls = "border-line bg-bg text-ink";
                return (
                  <button
                    key={oi}
                    disabled={checked}
                    onClick={() =>
                      setAnswers((prev) =>
                        prev.map((a, i) => (i === qi ? oi : a))
                      )
                    }
                    className={`flex w-full items-center rounded-xl border px-4 py-3 text-left text-sm transition disabled:cursor-default ${cls}`}
                  >
                    <span
                      className={`mr-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs ${
                        selected && !checked
                          ? "border-accent bg-accent text-white"
                          : "border-line bg-card text-ink-soft"
                      }`}
                    >
                      {String.fromCharCode(65 + oi)}
                    </span>
                    {opt}
                    {checked && oi === q.correctIndex && (
                      <span className="ml-auto font-bold">✓</span>
                    )}
                    {checked && selected && isWrong && (
                      <span className="ml-auto font-bold">✗</span>
                    )}
                  </button>
                );
              })}
            </div>
            {checked && q.explanation && (
              <p
                className={`mt-3 rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                  isWrong
                    ? "border border-red/20 bg-red-soft text-red"
                    : "border border-green/20 bg-green-soft text-green"
                }`}
              >
                {isWrong ? "正确答案已标绿。" : "回答正确。"} {q.explanation}
              </p>
            )}
          </div>
        );
      })}

      {!checked && (
        <div className="flex items-center gap-3">
          <button
            onClick={check}
            disabled={!allAnswered}
            className="rounded-xl bg-ink px-6 py-2.5 text-sm font-semibold text-bg transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            {activeIdx ? "提交答案" : "提交答案"}
          </button>
          <span className="text-xs text-ink-soft">
            {allAnswered
              ? "Enter 提交"
              : `还需回答 ${shown.filter((_, i) => answers[i] === null).length} 题 · 数字键 1-9 选答案`}
          </span>
        </div>
      )}
      {checked && (
        <div
          className={`fade-up rounded-2xl border p-5 text-sm ${
            allCorrect
              ? "border-green/30 bg-green-soft text-green"
              : "border-amber/40 bg-amber-soft text-amber-deep"
          }`}
        >
          {allCorrect ? (
            <>
              <p>
                ✓ {activeIdx ? "错题全部答对" : `全部答对 (${score}/${shown.length})`}
                ,测验通过,即将继续下一项
              </p>
              {chapterConcepts && chapterConcepts.length > 0 && (
                <p className="mt-2.5 text-xs leading-relaxed text-green/80">
                  本章核心概念回顾:{" "}
                  {chapterConcepts.map((c) => (
                    <span
                      key={c}
                      className="mx-0.5 inline-block rounded-full border border-green/30 bg-card/60 px-2 py-0.5 font-mono text-[11px]"
                    >
                      {c}
                    </span>
                  ))}
                </p>
              )}
            </>
          ) : (
            <>
              <p>
                得分 {score}/{shown.length},答对全部题目后才能通过
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={reworkWrong}
                  className="rounded-xl border border-amber-500/40 bg-card px-4 py-2 text-xs font-semibold text-amber-deep transition hover:bg-amber-soft"
                >
                  只重做答错的题 ({wrongIdx.length})
                </button>
                <button
                  onClick={() => {
                    setActiveIdx(null);
                    setAnswers(questions.map(() => null));
                    setChecked(false);
                  }}
                  className="rounded-xl border border-amber-500/40 bg-card px-4 py-2 text-xs font-semibold text-amber-deep transition hover:bg-amber-soft"
                >
                  全部重新作答
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
