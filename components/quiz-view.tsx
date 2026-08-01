"use client";

import { useState } from "react";
import type { QuizQuestion } from "@/lib/types";

interface Props {
  questions: QuizQuestion[];
  onComplete: () => void;
}

export default function QuizView({ questions, onComplete }: Props) {
  const [answers, setAnswers] = useState<(number | null)[]>(
    questions.map(() => null)
  );
  const [checked, setChecked] = useState(false);

  const allAnswered = answers.every((a) => a !== null);
  const score = checked
    ? answers.filter((a, i) => a === questions[i].correctIndex).length
    : 0;
  const allCorrect = checked && score === questions.length;

  function check() {
    const correct = answers.filter(
      (a, i) => a === questions[i].correctIndex
    ).length;
    setChecked(true);
    if (correct === questions.length) onComplete();
  }

  return (
    <div className="space-y-5">
      {questions.map((q, qi) => {
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
            提交答案
          </button>
          <span className="text-xs text-ink-soft">
            {allAnswered ? "" : `还需回答 ${questions.filter((_, i) => answers[i] === null).length} 题`}
          </span>
        </div>
      )}
      {checked && (
        <div
          className={`fade-up rounded-2xl border p-5 text-sm ${
            allCorrect
              ? "border-green/30 bg-green-soft text-green"
              : "border-amber/40 bg-amber-50 text-amber-700"
          }`}
        >
          {allCorrect
            ? `✓ 全部答对 (${score}/${questions.length})!测验通过,即将继续下一项`
            : `得分 ${score}/${questions.length},答对全部题目后才能通过`}
        </div>
      )}
    </div>
  );
}
