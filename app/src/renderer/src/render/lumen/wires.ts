/**
 * omadia-canvas-protocol/1.1 — ports, expose & wires (lumens-spec.md §7).
 *
 * Tier-1 cross-element interaction, resolved deterministically by stable id.
 * Pure (no DOM/React) so it is unit-testable and replayable:
 *   - a node's `out` port routes to another's `in` port via a declared `wire`;
 *   - an element may publish a read-only `expose` interface a neighbour reads
 *     by name — but ONLY what was exposed (least-privilege; un-exposed state is
 *     unreadable, so an imported element sees no ambient neighbour state).
 * Wires/expose are declared data, whitelist-validated, and resolve by id ⇒
 * deterministic, shared-canvas-safe. The agent owns which wires/interfaces
 * exist; the client owns the values flowing through them (authority split).
 */
export type PortType = 'selection' | 'viewport' | 'int' | 'number' | 'bool' | 'string' | 'enum' | 'list' | 'record' | 'grid' | 'dataRef' | 'any';

export interface PortSpec {
  name: string;
  dir: 'in' | 'out';
  type: PortType;
}
export interface ExposeSpec {
  name: string;
  type: PortType;
}
export interface TargetRef {
  kind?: string;
  elementId?: string;
}
export interface Wire {
  from: { ref: TargetRef; port: string };
  to: { ref: TargetRef; port: string };
}

/** What a single canvas element declares for wiring. */
export interface WireableElement {
  ports?: PortSpec[];
  expose?: ExposeSpec[];
}

export interface WireValidation {
  ok: boolean;
  errors: string[];
}

const portKey = (elementId: string, port: string): string => `${elementId}.${port}`;

function typesCompatible(a: PortType, b: PortType): boolean {
  return a === b || a === 'any' || b === 'any';
}

/** Static validation of a wire graph against the elements' declarations (§7).
 *  A wire is valid iff: both refs resolve to known elements; the source offers
 *  the port as an `out` port OR an `expose` field; the target declares it as an
 *  `in` port; and the types are compatible. */
export function validateWireGraph(elements: Record<string, WireableElement>, wires: Wire[]): WireValidation {
  const errors: string[] = [];
  const seenTargets = new Set<string>();

  for (const wire of wires) {
    const fromId = wire.from.ref.elementId;
    const toId = wire.to.ref.elementId;
    if (!fromId || !elements[fromId]) { errors.push(`wire source element '${fromId ?? '?'}' is unknown`); continue; }
    if (!toId || !elements[toId]) { errors.push(`wire target element '${toId ?? '?'}' is unknown`); continue; }

    const src = elements[fromId]!;
    const dst = elements[toId]!;
    const outPort = src.ports?.find((p) => p.dir === 'out' && p.name === wire.from.port);
    const exposed = src.expose?.find((e) => e.name === wire.from.port);
    const sourceType = outPort?.type ?? exposed?.type;
    if (sourceType === undefined) {
      errors.push(`'${fromId}' offers no out-port or expose named '${wire.from.port}'`);
      continue;
    }
    const inPort = dst.ports?.find((p) => p.dir === 'in' && p.name === wire.to.port);
    if (!inPort) {
      errors.push(`'${toId}' has no in-port named '${wire.to.port}'`);
      continue;
    }
    if (!typesCompatible(sourceType, inPort.type)) {
      errors.push(`wire ${portKey(fromId, wire.from.port)} (${sourceType}) → ${portKey(toId, wire.to.port)} (${inPort.type}): incompatible types`);
    }
    const targetKey = portKey(toId, wire.to.port);
    if (seenTargets.has(targetKey)) errors.push(`in-port ${targetKey} is driven by more than one wire`);
    seenTargets.add(targetKey);
  }

  return { ok: errors.length === 0, errors };
}

/** Propagate source out/expose values across the wires to the target in-ports.
 *  `outValues` is keyed by `${elementId}.${port}`; returns the in-port values
 *  keyed the same way. Unconnected/absent sources simply don't appear. */
export function resolveWires(wires: Wire[], outValues: Record<string, unknown>): Record<string, unknown> {
  const inValues: Record<string, unknown> = {};
  for (const wire of wires) {
    const fromId = wire.from.ref.elementId;
    const toId = wire.to.ref.elementId;
    if (!fromId || !toId) continue;
    const sourceKey = portKey(fromId, wire.from.port);
    if (!Object.prototype.hasOwnProperty.call(outValues, sourceKey)) continue;
    inValues[portKey(toId, wire.to.port)] = outValues[sourceKey];
  }
  return inValues;
}

/** Least-privilege read of a neighbour's published view-state (§7). Returns the
 *  value ONLY if `elementId` actually `expose`d a field of that name; otherwise
 *  undefined — un-exposed state stays private even to a same-id reader. */
export function readExposed(
  elements: Record<string, WireableElement>,
  published: Record<string, Record<string, unknown>>,
  elementId: string,
  name: string,
): unknown {
  const declares = elements[elementId]?.expose?.some((e) => e.name === name);
  if (!declares) return undefined;
  return published[elementId]?.[name];
}
