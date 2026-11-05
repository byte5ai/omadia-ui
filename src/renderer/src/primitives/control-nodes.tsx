import { type ReactElement, useEffect, useId, useRef, useState } from "react";

import { Icon, iconForRef } from "../components/icons";
import { arr, type Node, str } from "../lib/tree";
import { useRender } from "./render-context";

type Action = { type: string; payload?: unknown; effect?: string };

const actionOf = (node: Node): Action | undefined => {
  const a = node.action as Action | undefined;
  return a && typeof a.type === "string" ? a : undefined;
};

const withPayload = (
  action: Action | undefined,
  fallback: string,
  extra: Record<string, unknown>,
): Action => {
  const base = action ?? { type: fallback };
  const payload =
    base.payload && typeof base.payload === "object"
      ? { ...(base.payload as object), ...extra }
      : extra;
  return {
    type: base.type,
    payload,
    ...(base.effect ? { effect: base.effect } : {}),
  };
};

/** One main action per surface; after sending, omadia takes over and the
 *  button goes quiet. */
export function ButtonNode({ node }: { node: Node }): ReactElement {
  const ctx = useRender();
  const id = str(node.id);
  const label = str(node.label) ?? "";
  const icon = iconForRef(node.icon);
  const sent = id !== undefined && ctx.sent.has(id);
  const tone = str(node.tone);
  const styles = arr(node.style);
  const variant =
    tone === "danger"
      ? "danger"
      : styles.includes("accent")
        ? "primary"
        : styles.includes("no-accent") || styles.includes("compact")
          ? "ghost"
          : "";
  const iconOnly = icon !== undefined && label === "";

  const onClick = (): void => {
    const action = actionOf(node);
    if (ctx.form) {
      ctx.action(
        withPayload(action, "form_submit", { fields: ctx.form.values() }),
        id,
      );
      return;
    }
    ctx.action(action ?? { type: "button_press", payload: { label } }, id);
  };

  if (iconOnly) {
    return (
      <button
        type="button"
        className={`icon-btn${node.iconState === "active" ? " active" : ""}`}
        aria-label={str(node.icon) ?? "Aktion"}
        onClick={onClick}
        disabled={sent}
      >
        <Icon name={icon} />
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`btn${variant ? ` ${variant}` : ""}${sent ? " sent" : ""}`}
      onClick={onClick}
      disabled={sent || (ctx.busy && !!ctx.form)}
    >
      {icon ? <Icon name={icon} /> : null}
      {sent ? "Gesendet" : label}
    </button>
  );
}

export function InputNode({ node }: { node: Node }): ReactElement {
  const ctx = useRender();
  const fieldId = useId();
  const id = str(node.id) ?? fieldId;
  const serverValue = str(node.value) ?? "";
  const [value, setValue] = useState(serverValue);
  const sentValue = useRef(serverValue);
  const error = node.error as { message?: string } | null | undefined;
  const multiline = arr(node.style).includes("prose");

  useEffect(() => {
    setValue(serverValue);
    sentValue.current = serverValue;
  }, [serverValue]);
  useEffect(() => ctx.form?.set(id, value), [ctx.form, id, value]);

  const commit = (): void => {
    if (ctx.form || value === sentValue.current) return;
    const action = actionOf(node);
    if (!action) return;
    sentValue.current = value;
    ctx.action(withPayload(action, "input_change", { value }), str(node.id));
  };

  const common = {
    id: fieldId,
    className: `input${error?.message ? " invalid" : ""}`,
    value,
    placeholder: str(node.placeholder),
    onChange: (e: { target: { value: string } }) => setValue(e.target.value),
    onBlur: commit,
  };
  return (
    <div className="field">
      {str(node.label) ? (
        <label htmlFor={fieldId}>{str(node.label)}</label>
      ) : null}
      {multiline ? (
        <textarea {...common} />
      ) : (
        <input
          {...common}
          type="text"
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
        />
      )}
    </div>
  );
}

/** Selected means: in ink. A pick sends once and then holds. */
export function ChoiceNode({ node }: { node: Node }): ReactElement {
  const ctx = useRender();
  const groupId = useId();
  const id = str(node.id) ?? groupId;
  const options = arr(node.options) as Array<{ value: string; label: string }>;
  const [value, setValue] = useState(str(node.value));
  const [locked, setLocked] = useState(false);
  const label = str(node.label);

  useEffect(() => setValue(str(node.value)), [node.value]);

  const pick = (v: string): void => {
    if (locked) return;
    setValue(v);
    if (ctx.form) {
      ctx.form.set(id, v);
      return;
    }
    setLocked(true);
    ctx.action(
      withPayload(actionOf(node), "choice_select", { value: v }),
      str(node.id),
    );
  };

  if (node.variant === "dropdown") {
    return (
      <div className="field">
        {label ? <label htmlFor={groupId}>{label}</label> : null}
        <div className="select-wrap">
          <select
            id={groupId}
            className="input"
            value={value ?? ""}
            disabled={locked}
            onChange={(e) => pick(e.target.value)}
          >
            {value === undefined ? (
              <option value="">Bitte wählen</option>
            ) : null}
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" className="select-chevron" />
        </div>
      </div>
    );
  }
  return (
    <fieldset className="p-choice">
      {label ? <legend className="field-label">{label}</legend> : null}
      {options.map((o) => (
        <label
          key={o.value}
          className={`choice-row${value === o.value ? " on" : ""}`}
        >
          <input
            type="radio"
            className="radio"
            name={groupId}
            value={o.value}
            checked={value === o.value}
            disabled={locked && value !== o.value}
            onChange={() => pick(o.value)}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

export function ToggleNode({ node }: { node: Node }): ReactElement {
  const ctx = useRender();
  const fieldId = useId();
  const id = str(node.id) ?? fieldId;
  const [on, setOn] = useState(node.value === true);

  useEffect(() => setOn(node.value === true), [node.value]);
  useEffect(() => ctx.form?.set(id, on), [ctx.form, id, on]);

  const flip = (): void => {
    const next = !on;
    setOn(next);
    if (ctx.form) return;
    const action = actionOf(node);
    if (action)
      ctx.action(
        withPayload(action, "toggle_change", { value: next }),
        str(node.id),
      );
  };

  if (node.variant === "switch") {
    return (
      <label className={`choice-row${on ? " on" : ""}`}>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          className="switch"
          onClick={flip}
        />
        {str(node.label)}
      </label>
    );
  }
  return (
    <label className={`choice-row${on ? " on" : ""}`}>
      <input type="checkbox" className="check" checked={on} onChange={flip} />
      {str(node.label)}
    </label>
  );
}
