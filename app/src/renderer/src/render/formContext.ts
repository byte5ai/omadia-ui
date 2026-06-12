import { createContext, useContext } from 'react';

export interface CanvasFormStore {
  set: (id: string, value: unknown) => void;
  collect: () => Record<string, unknown>;
}

/** A fresh collector backing one form primitive — a Map of fieldId→value with
 *  set/collect. Exported so FormNode shares it (via useRef) and tests can drive
 *  the collection contract without a DOM renderer. */
export function createCanvasFormStore(): CanvasFormStore {
  const values = new Map<string, unknown>();
  return {
    set: (id, value) => {
      values.set(id, value);
    },
    collect: () => Object.fromEntries(values),
  };
}

/** Form-scoped collector; standalone controls/buttons see null and keep turn semantics. */
export const CanvasFormContext = createContext<CanvasFormStore | null>(null);

/** Read the nearest form collector, or null when the control stands alone. */
export const useCanvasForm = (): CanvasFormStore | null => useContext(CanvasFormContext);
