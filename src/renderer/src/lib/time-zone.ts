/** Reading time zones out of cell values (UTC/GMT offsets, IANA names). */

export type Zone =
  { kind: "offset"; minutes: number } | { kind: "iana"; name: string };

const OFFSET =
  /^(?:UTC|GMT)?\s*([+\-−])\s*(\d{1,2})(?::?(\d{2}))?(?::\d{2})?$/i;

export function parseZone(value: unknown): Zone | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (/^(UTC|GMT|Z)(\s*[±+]?0{1,2}(:00)?)?$/i.test(v))
    return { kind: "offset", minutes: 0 };
  const m = OFFSET.exec(v);
  if (m && (/^(UTC|GMT)/i.test(v) || /^[+\-−]\d{2}:\d{2}$/.test(v))) {
    const sign = m[1] === "+" ? 1 : -1;
    const minutes = sign * (Number(m[2]) * 60 + Number(m[3] ?? 0));
    return Math.abs(minutes) <= 14 * 60 ? { kind: "offset", minutes } : null;
  }
  if (/^[A-Z][A-Za-z_]+\/[A-Za-z_\-/]+$/.test(v)) {
    try {
      new Intl.DateTimeFormat("de-DE", { timeZone: v });
      return { kind: "iana", name: v };
    } catch {
      return null;
    }
  }
  return null;
}

/** Column labels that ask for a time rather than a zone name. */
export const isTimeColumn = (label: string): boolean =>
  /zeit|time|uhr|clock|now|jetzt/i.test(label) &&
  !/zone|offset|versatz/i.test(label);

/** The column whose values name time zones, if most rows do. */
export function zoneColumn(
  columns: Array<{ fieldKey: string }>,
  rows: Array<{ cells: Record<string, unknown> }>,
): string | undefined {
  if (rows.length === 0) return undefined;
  return columns.find(
    (c) =>
      rows.filter((r) => parseZone(r.cells[c.fieldKey]) !== null).length >=
      Math.ceil(rows.length / 2),
  )?.fieldKey;
}
