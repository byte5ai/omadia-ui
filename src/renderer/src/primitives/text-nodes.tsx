import { type ReactElement, useState } from "react";

import { arr, type Node, num, str, stripMarkdown } from "../lib/tree";

const styleClasses = (node: Node): string =>
  arr(node.style)
    .filter((s): s is string => typeof s === "string")
    .map((s) => `s-${s}`)
    .join(" ");

/** Light inline markdown: paragraphs, bullet lines, bold and code spans. */
function Rich({ text }: { text: string }): ReactElement {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => (
                <li key={j}>
                  <Inline text={l.replace(/^\s*[-*•]\s+/, "")} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <span key={j}>
                {j > 0 ? <br /> : null}
                <Inline text={l} />
              </span>
            ))}
          </p>
        );
      })}
    </>
  );
}

function Inline({ text }: { text: string }): ReactElement {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^\*\*[^*]+\*\*$/.test(p))
          return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (/^`[^`]+`$/.test(p))
          return (
            <code key={i} className="mono">
              {p.slice(1, -1)}
            </code>
          );
        return <span key={i}>{p.replace(/__/g, "")}</span>;
      })}
    </>
  );
}

export function TextNode({ node }: { node: Node }): ReactElement {
  const tone = str(node.tone);
  return (
    <div
      className={`p-text ${styleClasses(node)}${tone && tone !== "neutral" ? ` tone-${tone}` : ""}`}
    >
      <Rich text={str(node.content) ?? ""} />
    </div>
  );
}

export function HeadingNode({ node }: { node: Node }): ReactElement {
  const level = Math.min(6, Math.max(1, num(node.level) ?? 2));
  const Tag = `h${level}` as "h1";
  return (
    <Tag className={`p-heading h${level}`}>
      {stripMarkdown(str(node.content) ?? "")}
    </Tag>
  );
}

const TONES = new Set(["success", "warning", "danger", "info", "neutral"]);

export function StatusNode({ node }: { node: Node }): ReactElement {
  const tone = str(node.tone);
  return (
    <span className={`status ${tone && TONES.has(tone) ? tone : "neutral"}`}>
      {stripMarkdown(str(node.text) ?? "")}
    </span>
  );
}

export function DividerNode(): ReactElement {
  return <hr className="p-divider" />;
}

export function ProgressNode({ node }: { node: Node }): ReactElement {
  const raw = num(node.value);
  const value =
    raw === undefined ? undefined : raw <= 1 ? raw * 100 : Math.min(100, raw);
  const indeterminate = node.indeterminate === true || value === undefined;
  return (
    <div className="p-progress">
      <div
        className={`p-progress-track${indeterminate ? " indeterminate" : ""}`}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        {...(indeterminate ? {} : { "aria-valuenow": Math.round(value) })}
      >
        <div
          className="p-progress-fill"
          style={indeterminate ? undefined : { width: `${value}%` }}
        />
      </div>
      {indeterminate ? null : (
        <span className="p-progress-value num">{Math.round(value)} %</span>
      )}
    </div>
  );
}

export function ImageNode({ node }: { node: Node }): ReactElement {
  const [failed, setFailed] = useState(false);
  const src = str(node.src);
  const alt = str(node.altText) ?? "";
  if (!src || failed) {
    return (
      <figure className="p-image missing">
        <span>{alt || "Bild nicht verfügbar"}</span>
      </figure>
    );
  }
  return (
    <figure className="p-image">
      <img src={src} alt={alt} onError={() => setFailed(true)} />
    </figure>
  );
}
