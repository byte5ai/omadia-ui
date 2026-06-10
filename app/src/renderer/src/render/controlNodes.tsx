import { useRef, useState, type ReactNode } from 'react';
import type { PrimitiveAction, PrimitiveJson } from './PrimitiveNode.js';

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
  const [value, setValue] = useState((node['value'] as string) ?? '');
  const lastSent = useRef((node['value'] as string) ?? '');
  const commit = (): void => {
    if (value === lastSent.current) return;
    lastSent.current = value;
    emitValue(node, onAction, 'input_change', value);
  };
  return (
    <label className="lume-input" data-id={node['id'] as string}>
      {typeof node['label'] === 'string' && <span className="lume-control-label">{node['label']}</span>}
      <input
        className="lume-input-field"
        value={value}
        placeholder={(node['placeholder'] as string) ?? ''}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </label>
  );
}

/** `toggle` — checkbox (default) or switch variant; flips client-side, reports upstream. */
export function ToggleNode({ node, onAction }: ControlProps): ReactNode {
  const [value, setValue] = useState(Boolean(node['value']));
  const flip = (): void => {
    const next = !value;
    setValue(next);
    emitValue(node, onAction, 'toggle_change', next);
  };
  const isSwitch = node['variant'] === 'switch';
  return (
    <label className={`lume-toggle${isSwitch ? ' lume-toggle-switch' : ''}`} data-id={node['id'] as string}>
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
  const options = (node['options'] as Array<{ value: string; label: string }>) ?? [];
  const [value, setValue] = useState((node['value'] as string) ?? '');
  const [picked, setPicked] = useState(false);
  if (options.length === 0) return null;
  const emit = (next: string): void => {
    if (picked) return;
    setValue(next);
    setPicked(true);
    emitValue(node, onAction, 'choice_select', next);
  };

  if (node['variant'] === 'dropdown') {
    return (
      <label className="lume-choice" data-id={node['id'] as string}>
        {typeof node['label'] === 'string' && (
          <span className="lume-control-label">{node['label']}</span>
        )}
        <select
          className="lume-choice-select"
          value={value}
          disabled={picked}
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
      className={`lume-choice${picked ? ' lume-choice-locked' : ''}`}
      data-id={node['id'] as string}
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
            name={(node['id'] as string) ?? 'choice'}
            value={o.value}
            checked={o.value === value}
            disabled={picked}
            onChange={() => emit(o.value)}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
