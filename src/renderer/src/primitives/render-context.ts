import { createContext, useContext } from "react";

import { createStore } from "../lib/create-store";
import type { ActionInput } from "../state/canvases";

/** What every primitive needs from the pane it is rendered in. */
export interface RenderContextValue {
  slotKey: string;
  /** ids a patch just touched: they rise out of the half-dark */
  changed: ReadonlySet<string>;
  /** element ids whose action was sent and is being worked on */
  sent: ReadonlySet<string>;
  busy: boolean;
  /** set inside a form: controls report values instead of sending actions */
  form?: FormBinding;
  /** depth 0 = the canvas root, rendered frameless */
  depth: number;
  action(action: ActionInput, sourceId?: string): void;
  openRowPanel(containerId: string, rowKey: string, x: number, y: number): void;
}

export interface FormBinding {
  set(controlId: string, value: unknown): void;
  values(): Record<string, unknown>;
}

export const RenderContext = createContext<RenderContextValue | null>(null);

export function useRender(): RenderContextValue {
  const ctx = useContext(RenderContext);
  if (!ctx) throw new Error("primitive rendered outside a canvas");
  return ctx;
}

/** Row selection is yours, kept per canvas and sent along as viewState. */
export interface Selection {
  containerId: string;
  keys: string[];
}

export const selectionStore = createStore<
  Record<string, Selection | undefined>
>({});

export function select(
  slotKey: string,
  containerId: string,
  key: string,
  multi: boolean,
): void {
  selectionStore.set((s) => {
    const cur = s[slotKey];
    const same = cur?.containerId === containerId;
    let keys: string[];
    if (multi && same) {
      keys = cur.keys.includes(key)
        ? cur.keys.filter((k) => k !== key)
        : [...cur.keys, key];
    } else {
      keys = same && cur.keys.length === 1 && cur.keys[0] === key ? [] : [key];
    }
    return { ...s, [slotKey]: keys.length ? { containerId, keys } : undefined };
  });
}

export function clearSelection(slotKey: string): void {
  selectionStore.set((s) => ({ ...s, [slotKey]: undefined }));
}
