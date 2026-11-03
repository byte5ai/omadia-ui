import { describe, expect, it } from 'vitest';
import { applyServerMessage, initialCanvasState } from '../../src/renderer/src/store/canvasStore.js';
import { decisionView } from '../../src/renderer/src/store/decisionView.js';
import type { ServerMessage } from '../../src/shared/protocol.js';

const ANSWERED = {
  provider: 'jev',
  model: 'jev-1.14.0',
  verdict: 'data',
  tool: 'odoo_query',
  confidence: 0.86,
  ms: 640,
  direct: true,
  answered: true,
  steps: [
    { task: 'fast-path.gate', choice: 'data', confidence: 0.95, ms: 210 },
    { task: 'fast-path.source', choice: 'tool:odoo_query', confidence: 0.9, ms: 190 },
    { task: 'fast-path.direct-plan', choice: 'plan:p1', confidence: 0.92, ms: 180 },
    { task: 'canvas.layout', choice: 'chart_bar', confidence: 0.81, ms: 160 },
  ],
  ui: { skeleton: 'plan', layout: 'bar' },
};

describe('decisionView', () => {
  it('an answered turn: every step in words, the saved model calls, the chart in the headline', () => {
    const v = decisionView(ANSWERED);
    expect(v?.provider).toBe('Jev');
    expect(v?.tone).toBe('answered');
    expect(v?.headline).toBe('ohne LLM beantwortet · Balkendiagramm');
    expect(v?.lines.map((l) => [l.label, l.value, l.confidencePct])).toEqual([
      ['Gate', 'Daten, kein Sprachmodell nötig', 95],
      ['Datenquelle', 'odoo_query', 90],
      ['Gelernte Abfrage', 'gespeicherte Abfrage direkt ausgeführt', 92],
      ['Darstellung', 'Balkendiagramm', 81],
      ['Ansicht', 'aus der Abfrage gebaut, ohne Composer-Modell', undefined],
    ]);
    expect(v?.saved).toBe('Router, Planner, Composer ohne Sprachmodell');
  });

  it('a simple model turn and an unsure gate', () => {
    const simple = decisionView({ provider: 'jev', verdict: 'model', route: 'simple', confidence: 0.9, ms: 200, ui: { skeleton: 'simple' } });
    expect(simple?.headline).toBe('Sprachmodell · einfach');
    expect(simple?.tone).toBe('model');
    const unsure = decisionView({ provider: 'jev', verdict: 'model', confidence: 0.4, ms: 200, fallback: true, steps: [{ task: 'fast-path.gate', choice: 'model_complex', confidence: 0.4, ms: 200 }], ui: { skeleton: 'composer' } });
    expect(unsure?.tone).toBe('fallback');
    expect(unsure?.saved).toBeUndefined();
  });

  it('the batch turn gate: its questions in words, yes/no answers', () => {
    const v = decisionView({
      ...ANSWERED,
      direct: undefined,
      steps: [
        { task: 'fast-path.turn-gate.data', choice: 'yes', confidence: 0.93, ms: 180 },
        { task: 'fast-path.turn-gate.complex', choice: 'no', confidence: 0.8, ms: 180 },
        { task: 'fast-path.turn-gate.source', choice: 'tool:odoo_query', confidence: 0.95, ms: 180 },
        { task: 'fast-path.turn-gate.slot', choice: 'value', confidence: 0.9, ms: 180 },
      ],
    });
    expect(v?.lines.slice(0, 4).map((l) => [l.label, l.value])).toEqual([
      ['Nur Daten', 'ja'],
      ['Komplex', 'nein'],
      ['Datenquelle', 'odoo_query'],
      ['Wert', 'aus der Nachricht übernommen'],
    ]);
  });

  it('a chosen chart the rows did not fit: the shown table and why', () => {
    const v = decisionView({ ...ANSWERED, ui: { skeleton: 'plan', layout: 'table' } });
    expect(v?.headline).toBe('ohne LLM beantwortet');
    expect(v?.lines.at(-1)).toEqual({ label: 'Gezeigt', value: 'Tabelle – die Zeilen passen nicht in ein Diagramm' });
  });

  it('an older server without steps still gets its gate line', () => {
    const v = decisionView({ provider: 'jev', verdict: 'data', tool: 'odoo_query', confidence: 0.8, ms: 300, answered: true });
    expect(v?.lines.map((l) => l.label)).toEqual(['Gate', 'Datenquelle']);
  });

  it('malformed input is no chip', () => {
    for (const bad of [null, 'x', {}, { provider: 'jev', verdict: 'maybe', confidence: 1, ms: 1 }, { provider: 'jev', verdict: 'data', confidence: Number.NaN, ms: 1 }]) {
      expect(decisionView(bad)).toBeNull();
    }
  });
});

describe('canvasStore — the turn decision', () => {
  it('turn_complete carries it, turn_error clears it', () => {
    const done = applyServerMessage(initialCanvasState, { type: 'turn_complete', forTurn: 't1', decision: ANSWERED } as ServerMessage).state;
    expect(done.decision?.provider).toBe('Jev');
    const failed = applyServerMessage(done, { type: 'turn_error', forTurn: 't2', message: 'x' }).state;
    expect(failed.decision).toBeNull();
    const plain = applyServerMessage(done, { type: 'turn_complete', forTurn: 't3' }).state;
    expect(plain.decision).toBeNull();
  });
});
