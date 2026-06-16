/** omadia-canvas-protocol/1.1 — `scene` primitive TS types (lumens-spec.md §3).
 *  Mirrors schema/scene.schema.json; the schema is the contract. */

export type ColorToken = string; // validated by the schema to the token enum
export type TypeRegister = 'display' | 'prose' | 'mono';

export interface SceneTransform {
  x?: number;
  y?: number;
  scale?: number;
  rotate?: number; // degrees
}

export type SceneNode =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r?: number; fill?: ColorToken; stroke?: ColorToken; strokeW?: number; id?: string; hitPadding?: number }
  | { kind: 'circle'; cx: number; cy: number; r: number; fill?: ColorToken; stroke?: ColorToken; strokeW?: number; id?: string; hitPadding?: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: ColorToken; strokeW?: number; id?: string; hitPadding?: number }
  | { kind: 'path'; points: [number, number][]; closed?: boolean; fill?: ColorToken; stroke?: ColorToken; strokeW?: number; id?: string; hitPadding?: number }
  | { kind: 'sprite'; x: number; y: number; w: number; h: number; dataRef: { id: string }; id?: string; hitPadding?: number }
  | { kind: 'text'; x: number; y: number; text: string; size?: number; weight?: number; register?: TypeRegister; fill?: ColorToken; id?: string; hitPadding?: number }
  | { kind: 'group'; transform?: SceneTransform; children: SceneNode[]; id?: string; hitPadding?: number };

export interface Scene {
  type: 'scene';
  id?: string;
  width: number;
  height: number;
  camera?: { x?: number; y?: number; zoom?: number };
  draw: SceneNode[];
}

/** Apple HIG minimum hit-target, in buffer units (§4). */
export const MIN_HIT_TARGET = 44;
