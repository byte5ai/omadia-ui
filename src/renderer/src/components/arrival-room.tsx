import {
  type Cone,
  coneBetween,
  createLight,
  followPointer,
  idleSway,
  type Light,
  spring,
  stepSpring,
  swung,
} from "@omadia/light";
import { type ReactElement, useEffect, useRef, useState } from "react";

import { useStore } from "../lib/create-store";
import { effectsStore } from "../state/effects";
import { LightCone } from "./light-cone";

/** How the room is: open for someone arriving, dim while a server is silent. */
export type ArrivalMood = "open" | "waiting";

/** The still cone in `light-cone.tsx`, in its 1440 × 900 frame. */
const FRAME = 1440;
const SLIT = { x: 1085, half: 45 };
const LAND = { x: 685, half: 215, y: 0.66 };

/** Spring rate per second: slower than the content it moves with. */
const RATE = 2.4;
/** A new screen sends the slit somewhere new, within this range (frame px). */
const SWING_MAX = 60;
const SWING_STEP = 30;
/** Top speed of an arriving card, px/s: the air goes with it. */
const SCENE_GUST = 166;
/** Leaving for the workspace: the room opens and the dust flies out. */
const LEAVE_GUST = 320;
const LEAVE_OPEN = 2.6;
const WAITING_OPEN = 0.6;
const WAITING_GAIN = 0.55;

const reducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Somewhere else, at least `SWING_STEP` away from where the slit is. */
function nextSwing(current: number): number {
  const left = Math.max(current - SWING_STEP + SWING_MAX, 0);
  const right = Math.max(SWING_MAX - current - SWING_STEP, 0);
  const pick = Math.random() * (left + right);
  return pick < left ? pick - SWING_MAX : current + SWING_STEP + pick - left;
}

/**
 * The room of the arrival screens: the cone with its fog and the dust in the
 * air, behind the card. It stays across screens: a new screen swings the
 * light and stirs the dust; a silent server dims it and lets the dust hang;
 * leaving for the workspace opens the light and blows the dust out. Without
 * effects or WebGL the still cone stands in.
 */
export function ArrivalRoom({
  scene,
  mood,
  leaving,
}: {
  scene: string;
  mood: ArrivalMood;
  leaving: boolean;
}): ReactElement {
  const effects = useStore(effectsStore, (s) => s);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lightRef = useRef<Light | null>(null);
  const open = useRef(spring(1));
  const swing = useRef(spring(0));
  const [hasLight, setHasLight] = useState(true);
  const [reduced] = useState(reducedMotion);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!effects || !canvas) return undefined;
    const light = createLight(canvas, {
      dust: true,
      reduced,
      cone: ({ width, height, seconds, dt }): Cone => {
        const scale = width / FRAME;
        for (const s of [open.current, swing.current]) {
          if (reduced) s.value = s.target;
          else stepSpring(s, RATE, dt / 1000);
        }
        const sway = reduced ? { swing: 0, open: 0 } : idleSway(seconds);
        const cone = coneBetween(
          { x: SLIT.x * scale, half: SLIT.half * scale },
          { x: LAND.x * scale, y: LAND.y * height, half: LAND.half * scale },
          open.current.value + sway.open,
        );
        return swung(cone, (swing.current.value + sway.swing) * scale);
      },
    });
    lightRef.current = light;
    setHasLight(light !== null);
    const stop = followPointer((x, y) => light?.room(x, y));
    return () => {
      stop();
      light?.destroy();
      lightRef.current = null;
    };
  }, [effects, reduced]);

  // A new screen: the light looks for it, the air moves with the card.
  const firstScene = useRef(scene);
  useEffect(() => {
    if (scene === firstScene.current) return;
    firstScene.current = scene;
    swing.current.target = nextSwing(swing.current.target);
    lightRef.current?.gust(SCENE_GUST);
  }, [scene]);

  useEffect(() => {
    const waiting = mood === "waiting";
    if (!leaving) open.current.target = waiting ? WAITING_OPEN : 1;
    lightRef.current?.gain(waiting ? WAITING_GAIN : 1);
    lightRef.current?.calm(waiting);
  }, [mood, leaving, hasLight]);

  useEffect(() => {
    if (!leaving) return;
    open.current.target = LEAVE_OPEN;
    lightRef.current?.calm(false);
    lightRef.current?.gust(LEAVE_GUST);
  }, [leaving]);

  if (!effects || !hasLight) return <LightCone />;
  return (
    <canvas ref={canvasRef} className="arrival-light" aria-hidden="true" />
  );
}
