import { type ReactElement, useEffect, useRef } from "react";

import { arr, type Node, str } from "../lib/tree";
import { answerQuestion } from "../state/canvases";
import { OmadiaMark } from "./logo";

/**
 * omadia's question back, asked over its own canvas only: the rest of the
 * workspace stays usable, and the ask bar below stays open for a free answer.
 * It lives in the canvas state, so it is still there when you come back.
 */
export function QuestionModal({
  slotKey,
  question,
  focused,
}: {
  slotKey: string;
  question: Node;
  focused: boolean;
}): ReactElement {
  const options = arr(question.options) as Array<{
    value: string;
    label: string;
  }>;
  const label = str(question.label) ?? "Was meinst du genau?";
  const first = useRef<HTMLButtonElement>(null);
  const titleId = `question-${slotKey}`;

  useEffect(() => {
    if (focused) first.current?.focus({ preventScroll: true });
  }, [focused, question.id]);

  return (
    <div className="question-layer">
      <div
        className="question-card panel"
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
      >
        <header className="question-head">
          <span
            className="voice-mark"
            data-dot-anchor={`pane:${slotKey}:question`}
            data-dot-size={5}
          >
            <OmadiaMark size={16} />
          </span>
          <h3 id={titleId} className="question-title">
            {label}
          </h3>
        </header>
        <div className="question-options">
          {options.map((o, i) => (
            <button
              key={o.value}
              ref={i === 0 ? first : undefined}
              type="button"
              className="question-option"
              onClick={() => answerQuestion(slotKey, question, o)}
            >
              <span className="radio" aria-hidden="true" />
              {o.label}
            </button>
          ))}
        </div>
        <p className="question-foot">Oder antworte unten frei.</p>
      </div>
    </div>
  );
}
