/**
 * The decision model's verdict for a canvas turn (`turn_complete.decision`,
 * e.g. TypeSafe Jev): before any language-model call it decided whether the
 * turn needs a model or one data source answers it, and on the canvas also
 * how the view is built. Pure view logic for the Jev chip; the input is
 * untrusted wire data, so everything is checked and capped.
 */

export interface DecisionLine {
  /** what was decided (`Gate`, `Quelle`, …) */
  label: string;
  /** the answer, in words */
  value: string;
  /** confidence in percent; absent for derived lines */
  confidencePct?: number;
  ms?: number;
}

export interface DecisionView {
  /** display name (`Jev`) */
  provider: string;
  model?: string;
  /** the chip's short outcome */
  headline: string;
  /** the chip's tone: answered without a model / routed to the model / unsure */
  tone: 'answered' | 'model' | 'fallback';
  /** every step, in call order, for the hover popover */
  lines: DecisionLine[];
  /** total decision time, ms */
  ms: number;
  /** model calls the decision saved, in words — absent when none */
  saved?: string;
}

const PROVIDERS: Readonly<Record<string, string>> = { jev: 'Jev' };
const MAX_TEXT = 80;
const MAX_STEPS = 8;

const TASK_LABEL: Readonly<Record<string, string>> = {
  'fast-path.gate': 'Gate',
  'fast-path.source': 'Datenquelle',
  'fast-path.direct-plan': 'Gelernte Abfrage',
  'canvas.layout': 'Darstellung',
};

const CHOICE_LABEL: Readonly<Record<string, string>> = {
  data: 'Daten, kein Sprachmodell nötig',
  model_simple: 'Sprachmodell, einfach',
  model_complex: 'Sprachmodell, komplex',
  none: 'keine passende Quelle',
  plan_new: 'neue Abfrage nötig',
  table: 'Tabelle',
  chart_bar: 'Balkendiagramm',
  chart_line: 'Liniendiagramm',
  chart_pie: 'Kreisdiagramm',
};

const VIEW_LABEL: Readonly<Record<string, string>> = {
  plan: 'aus der Abfrage gebaut, ohne Composer-Modell',
  cache: 'aus dem Antwort-Cache, ohne Composer-Modell',
  simple: 'Antwortansicht, ohne Composer-Modell',
  composer: 'vom Composer-Modell entworfen',
};

const LAYOUT_LABEL: Readonly<Record<string, string>> = {
  table: 'Tabelle',
  bar: 'Balkendiagramm',
  line: 'Liniendiagramm',
  pie: 'Kreisdiagramm',
};

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().slice(0, MAX_TEXT) : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

const pct = (confidence: number): number => Math.round(Math.min(1, Math.max(0, confidence)) * 100);

function choiceLabel(choice: string): string {
  if (choice.startsWith('tool:')) return choice.slice('tool:'.length);
  if (choice.startsWith('plan:')) return 'gespeicherte Abfrage direkt ausgeführt';
  return CHOICE_LABEL[choice] ?? choice;
}

function stepLines(raw: unknown): DecisionLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, MAX_STEPS).flatMap((s): DecisionLine[] => {
    if (typeof s !== 'object' || s === null) return [];
    const r = s as Record<string, unknown>;
    const task = text(r['task']);
    const choice = text(r['choice']);
    const confidence = num(r['confidence']);
    const ms = num(r['ms']);
    if (task === undefined || choice === undefined || confidence === undefined) return [];
    return [
      {
        label: TASK_LABEL[task] ?? task,
        value: choiceLabel(choice),
        confidencePct: pct(confidence),
        ...(ms !== undefined ? { ms: Math.round(ms) } : {}),
      },
    ];
  });
}

function headlineOf(d: Record<string, unknown>, layout: string | undefined): { headline: string; tone: DecisionView['tone'] } {
  if (d['fallback'] === true) return { headline: 'unsicher – Modell entschied', tone: 'fallback' };
  if (d['verdict'] === 'model') {
    return { headline: d['route'] === 'simple' ? 'Sprachmodell · einfach' : 'Sprachmodell', tone: 'model' };
  }
  if (d['answered'] === true) {
    const shown = layout !== undefined && layout !== 'table' ? ` · ${LAYOUT_LABEL[layout]}` : '';
    return { headline: `ohne LLM beantwortet${shown}`, tone: 'answered' };
  }
  return { headline: 'Daten → Agent', tone: 'model' };
}

/** Model calls the decision model replaced, in words. */
function savedOf(d: Record<string, unknown>, view: string | undefined): string | undefined {
  const saved: string[] = [];
  if (d['fallback'] !== true) saved.push('Router');
  if (d['direct'] === true) saved.push('Planner');
  if (view === 'plan' || view === 'cache' || view === 'simple') saved.push('Composer');
  return saved.length > 0 ? `${saved.join(', ')} ohne Sprachmodell` : undefined;
}

/** The chip's view of a decision, or null for anything malformed. */
export function decisionView(raw: unknown): DecisionView | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  const provider = text(d['provider']);
  const confidence = num(d['confidence']);
  const ms = num(d['ms']);
  if (provider === undefined || (d['verdict'] !== 'data' && d['verdict'] !== 'model')) return null;
  if (confidence === undefined || ms === undefined) return null;
  const model = text(d['model']);
  const ui = typeof d['ui'] === 'object' && d['ui'] !== null ? (d['ui'] as Record<string, unknown>) : {};
  const view = typeof ui['skeleton'] === 'string' && ui['skeleton'] in VIEW_LABEL ? ui['skeleton'] : undefined;
  const layout = typeof ui['layout'] === 'string' && ui['layout'] in LAYOUT_LABEL ? ui['layout'] : undefined;
  const lines = stepLines(d['steps']);
  // an older server sends no steps: the verdict itself is the one line
  if (lines.length === 0) {
    lines.push({
      label: 'Gate',
      value: d['verdict'] === 'data' ? CHOICE_LABEL['data']! : CHOICE_LABEL[`model_${d['route'] === 'simple' ? 'simple' : 'complex'}`]!,
      confidencePct: pct(confidence),
    });
    const tool = text(d['tool']);
    if (tool !== undefined) lines.push({ label: 'Datenquelle', value: tool });
  }
  if (view !== undefined) lines.push({ label: 'Ansicht', value: VIEW_LABEL[view]! });
  if (layout !== undefined && !lines.some((l) => l.label === TASK_LABEL['canvas.layout'])) {
    lines.push({ label: 'Darstellung', value: LAYOUT_LABEL[layout]! });
  }
  const saved = savedOf(d, view);
  return {
    provider: PROVIDERS[provider.toLowerCase()] ?? provider,
    ...(model !== undefined ? { model } : {}),
    ...headlineOf(d, layout),
    lines,
    ms: Math.round(ms),
    ...(saved !== undefined ? { saved } : {}),
  };
}
