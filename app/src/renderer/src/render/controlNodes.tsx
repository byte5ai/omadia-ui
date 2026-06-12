import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { PrimitiveAction, PrimitiveJson } from './PrimitiveNode.js';
import { useCanvasForm } from './formContext.js';

interface ControlProps {
  node: PrimitiveJson;
  onAction: (action: PrimitiveAction) => void;
}

type NodeAction = { type?: string; payload?: unknown } | undefined;

/** Merge the node's declared action payload with the control's current value. */
const emitValue = (
  node: PrimitiveJson,
  onAction: ControlProps['onAction'],
  defaultType: string,
  value: unknown,
): void => {
  const action = node['action'] as NodeAction;
  const base =
    typeof action?.payload === 'object' && action.payload !== null
      ? (action.payload as Record<string, unknown>)
      : {};
  onAction({
    type: action?.type ?? defaultType,
    payload: { ...base, value },
    sourceId: node['id'] as string,
  });
};

/** `input` keeps draft text client-side; commits on blur/Enter as a turn action. */
export function InputNode({ node, onAction }: ControlProps): ReactNode {
  const form = useCanvasForm();
  const nodeId = node['id'] as string;
  const initialValue = (node['value'] as string) ?? '';
  const [value, setValue] = useState(initialValue);
  const lastSent = useRef(initialValue);
  useEffect(() => {
    form?.set(nodeId, initialValue);
  }, []);
  const commit = (): void => {
    if (form) return;
    if (value === lastSent.current) return;
    lastSent.current = value;
    emitValue(node, onAction, 'input_change', value);
  };
  return (
    <label className="lume-input" data-id={nodeId}>
      {typeof node['label'] === 'string' && <span className="lume-control-label">{node['label']}</span>}
      <input
        className="lume-input-field"
        value={value}
        placeholder={(node['placeholder'] as string) ?? ''}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          form?.set(nodeId, next);
        }}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  );
}

/** `toggle` — checkbox (default) or switch variant; flips client-side, reports upstream. */
export function ToggleNode({ node, onAction }: ControlProps): ReactNode {
  const form = useCanvasForm();
  const nodeId = node['id'] as string;
  const initialValue = Boolean(node['value']);
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    form?.set(nodeId, initialValue);
  }, []);
  const flip = (): void => {
    const next = !value;
    setValue(next);
    if (form) {
      form.set(nodeId, next);
      return;
    }
    emitValue(node, onAction, 'toggle_change', next);
  };
  const isSwitch = node['variant'] === 'switch';
  return (
    <label className={`lume-toggle${isSwitch ? ' lume-toggle-switch' : ''}`} data-id={nodeId}>
      <input type="checkbox" checked={value} onChange={flip} />
      {isSwitch && <span className="lume-switch-track" aria-hidden="true" />}
      {typeof node['label'] === 'string' && <span className="lume-control-label">{node['label']}</span>}
    </label>
  );
}

/** `choice` keeps the picked value client-side; the pick itself goes upstream
 *  as a turn action (node.action.type, default `choice_select`). After the
 *  pick the element LOCKS and the chosen option pulses (beam lifecycle) until
 *  the answering turn replaces the tree — no double-fires. */
export function ChoiceNode({ node, onAction }: ControlProps): ReactNode {
  const form = useCanvasForm();
  const nodeId = node['id'] as string;
  const options = (node['options'] as Array<{ value: string; label: string }>) ?? [];
  const initialValue = (node['value'] as string) ?? '';
  const [value, setValue] = useState(initialValue);
  const [picked, setPicked] = useState(false);
  useEffect(() => {
    form?.set(nodeId, initialValue);
  }, []);
  if (options.length === 0) return null;
  const emit = (next: string): void => {
    if (!form && picked) return;
    setValue(next);
    if (form) {
      form.set(nodeId, next);
      return;
    }
    setPicked(true);
    emitValue(node, onAction, 'choice_select', next);
  };
  const locked = !form && picked;

  if (node['variant'] === 'dropdown') {
    return (
      <label className="lume-choice" data-id={nodeId}>
        {typeof node['label'] === 'string' && (
          <span className="lume-control-label">{node['label']}</span>
        )}
        <select
          className="lume-choice-select"
          value={value}
          disabled={locked}
          onChange={(e) => emit(e.target.value)}
        >
          {value === '' && <option value="" disabled hidden />}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <fieldset
      className={`lume-choice${locked ? ' lume-choice-locked' : ''}`}
      data-id={nodeId}
    >
      {typeof node['label'] === 'string' && (
        <legend className="lume-control-label">{node['label']}</legend>
      )}
      {options.map((o) => (
        <label
          key={o.value}
          className={`lume-choice-option${o.value === value ? ' lume-choice-active' : ''}`}
        >
          <input
            type="radio"
            name={nodeId ?? 'choice'}
            value={o.value}
            checked={o.value === value}
            disabled={locked}
            onChange={() => emit(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
