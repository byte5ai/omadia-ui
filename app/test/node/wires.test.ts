import { describe, expect, it } from 'vitest';
import {
  validateWireGraph,
  resolveWires,
  readExposed,
  type Wire,
  type WireableElement,
} from '../../src/renderer/src/render/lumen/wires.js';

// The canonical §7 example: a table exposes/out-ports its selection, wired to a
// map Lumen's selection in-port → selecting a row highlights the map markers,
// Tier-1, no turn.
const elements: Record<string, WireableElement> = {
  table: { ports: [{ name: 'selection', dir: 'out', type: 'selection' }], expose: [{ name: 'selection', type: 'selection' }] },
  map: { ports: [{ name: 'selection', dir: 'in', type: 'selection' }] },
  slider: { ports: [{ name: 'value', dir: 'out', type: 'number' }] },
};

const wire = (fromId: string, fromPort: string, toId: string, toPort: string): Wire => ({
  from: { ref: { kind: 'element', elementId: fromId }, port: fromPort },
  to: { ref: { kind: 'element', elementId: toId }, port: toPort },
});

describe('validateWireGraph (§7 static check)', () => {
  it('accepts a well-typed wire by stable id', () => {
    expect(validateWireGraph(elements, [wire('table', 'selection', 'map', 'selection')])).toMatchObject({ ok: true });
  });
  it('rejects an unknown source/target element', () => {
    expect(validateWireGraph(elements, [wire('ghost', 'selection', 'map', 'selection')]).ok).toBe(false);
    expect(validateWireGraph(elements, [wire('table', 'selection', 'ghost', 'selection')]).ok).toBe(false);
  });
  it('rejects a missing out-port / in-port', () => {
    expect(validateWireGraph(elements, [wire('table', 'nope', 'map', 'selection')]).ok).toBe(false);
    expect(validateWireGraph(elements, [wire('table', 'selection', 'map', 'nope')]).ok).toBe(false);
  });
  it('rejects incompatible port types', () => {
    const r = validateWireGraph(elements, [wire('slider', 'value', 'map', 'selection')]);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/incompatible/);
  });
  it('rejects an in-port driven by more than one wire', () => {
    const r = validateWireGraph(
      { ...elements, table2: { ports: [{ name: 'selection', dir: 'out', type: 'selection' }] } },
      [wire('table', 'selection', 'map', 'selection'), wire('table2', 'selection', 'map', 'selection')],
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/more than one wire/);
  });
  it("'any' is compatible with anything", () => {
    const els: Record<string, WireableElement> = {
      a: { ports: [{ name: 'o', dir: 'out', type: 'any' }] },
      b: { ports: [{ name: 'i', dir: 'in', type: 'number' }] },
    };
    expect(validateWireGraph(els, [wire('a', 'o', 'b', 'i')]).ok).toBe(true);
  });
});

describe('resolveWires (Tier-1 propagation)', () => {
  it('routes a source out value to the wired target in-port', () => {
    const out = { 'table.selection': ['row-3'] };
    expect(resolveWires([wire('table', 'selection', 'map', 'selection')], out)).toEqual({ 'map.selection': ['row-3'] });
  });
  it('skips a wire whose source has no current value', () => {
    expect(resolveWires([wire('table', 'selection', 'map', 'selection')], {})).toEqual({});
  });
});

describe('readExposed (least-privilege published interface)', () => {
  const published = { table: { selection: ['row-1'], secret: 'internal' } };
  it('returns a value the element actually exposed', () => {
    expect(readExposed(elements, published, 'table', 'selection')).toEqual(['row-1']);
  });
  it('returns undefined for an un-exposed field (private state stays private)', () => {
    expect(readExposed(elements, published, 'table', 'secret')).toBeUndefined();
  });
  it('returns undefined for an unknown element', () => {
    expect(readExposed(elements, published, 'ghost', 'selection')).toBeUndefined();
  });
});
