import type { LightTemperature } from "../../../shared/ipc";

/**
 * The three worlds of light. Each temperature means something, so a canvas
 * takes the one its request belongs to: 2700 K for deciding and overseeing,
 * 6500 K for building and running the platform, 4500 K for everything else.
 */
export type LightWorld = "decision" | "default" | "developer";

export const LIGHT_WORLDS: readonly LightWorld[] = [
  "decision",
  "default",
  "developer",
];

export const WORLD_TEMPERATURE: Record<LightWorld, LightTemperature> = {
  decision: 2700,
  default: 4500,
  developer: 6500,
};

export const WORLD_LABEL: Record<LightWorld, string> = {
  decision: "Entscheider",
  default: "Default",
  developer: "Developer",
};

type Cue = [pattern: RegExp, weight: number];

/*
 * German compounds carry their meaning at the end ("Jahresumsatz",
 * "Kostenstelle"), so decision words match inside words. Developer words are
 * often short and hide in ordinary ones ("api" in "Kapital", "log" in
 * "Katalog"), so they match whole words or clear prefixes only.
 */
const DECISION: readonly Cue[] = [
  [/umsatz|umsätze|revenue|erlös|turnover/, 3],
  [/kosten(?!los)|\bcosts?\b|ausgaben|\bspend(ing)?\b/, 2],
  [/budget|forecast|prognose|hochrechnung|planzahl/, 3],
  [/marge|margin|gewinn|profit|ebit|deckungsbeitrag|rentab/, 3],
  [/liquidität|cash ?flow|zahlungsfähig|offene posten|mahnung|forderung/, 3],
  [/\bkpis?\b|kennzahl|scorecard|zielerreichung|\bokrs?\b/, 3],
  [/freigabe|freigeben|genehmig|approv|unterschrift|sign[- ]?off/, 3],
  [/entscheid|decision|\bdecide|abwäg|soll(en)? (ich|wir)|should (i|we)/, 3],
  [/priorisier|prioriti[sz]|vergleich der optionen|trade-?off/, 2],
  [/risik|risk|compliance|audit|revision|datenschutz|dsgvo|gdpr|haftung/, 3],
  [/vertrag|verträge|contract|kündig|verhandl|negotiat|angebot|quote\b/, 2],
  [/quartal|quarter|\bq[1-4]\b|jahresabschluss|monatsabschluss|bilanz/, 2],
  [/strategi|roadmap|vorstand|geschäftsführ|board\b|management|investi/, 2],
  [
    /personalkosten|personalplan|gehalt|gehälter|salar|headcount|neueinstellung|recruiting|hiring|auslastung/,
    2,
  ],
  [
    /kunden?(abwanderung|verlust)|churn|pipeline-wert|\bdeals?\b|abschlussquote/,
    2,
  ],
  [/bericht|report|übersicht für|dashboard für (die|den) (gf|geschäft)/, 1],
];

const DEVELOPER: readonly Cue[] = [
  [/\bapis?\b|endpoints?\b|\brest\b|graphql|webhooks?\b|\bsdk\b/, 3],
  [/\bcode\b|quellcode|source code|\brepo(sitory)?s?\b|\bgit\b|commits?\b/, 3],
  [/pull request|\bprs?\b|merge request|branch(es)?\b|code review/, 3],
  [/deploy|\bbuilds?\b|\bci\b|\bcd\b|github actions|release|rollback/, 3],
  [/\blogs?\b|logfile|stack ?trace|exception|traceback|fehlermeldung/, 3],
  [/\bbugs?\b|debug|crash|absturz|timeout|\b5\d\d\b|\b4\d\d\b fehler/, 2],
  [/server|docker|container|kubernetes|\bk8s\b|cluster|\bvm\b|\bdns\b/, 2],
  [/datenbank|database|\bsql\b|query|schema|migration|index(e|es)?\b/, 2],
  [/\bjson\b|\byaml\b|\bcsv-?import|\bregex|typescript|python|node\.?js/, 3],
  [/plugins?\b|\bmcp\b|integration|konfigur|config|\benv\b|secrets?\b/, 2],
  [/latenz|latency|uptime|monitoring|cpu|memory|speicherverbrauch|metriken/, 2],
  [/\bllm\b|modell|\bmodel\b|embedding|token|prompt|agent/, 1],
  [/cron|queue|warteschlange|\bjobs?\b|worker|scheduler|\btests?\b/, 1],
];

const score = (text: string, cues: readonly Cue[]): number =>
  cues.reduce(
    (sum, [pattern, weight]) => sum + (pattern.test(text) ? weight : 0),
    0,
  );

/** Below this a request leans nowhere: it stays in the default light. */
const LEAN = 2;

/**
 * Which world a request belongs to. Reads the words, not the intent: a plain,
 * deterministic guess that stays the same for the same text. A tie, or too
 * little to go on, is the default world.
 */
export function classifyPrompt(text: string): LightWorld {
  const t = text.toLowerCase();
  const decision = score(t, DECISION);
  const developer = score(t, DEVELOPER);
  if (Math.max(decision, developer) < LEAN || decision === developer) {
    return "default";
  }
  return decision > developer ? "decision" : "developer";
}
