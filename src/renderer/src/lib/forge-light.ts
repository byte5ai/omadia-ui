/**
 * The light over a canvas being built. It falls from a slit at the top edge,
 * at the angle the light always has here, onto the middle of the tile. The
 * further the build, the wider the slit opens and the more of the middle
 * stands in the light. Every sign from idaria sends a pulse down the beam.
 * Fog, pulses, day and night come from @omadia/light; this only decides
 * where the light falls and how far it is open.
 */

import {
  type Cone,
  createLight,
  openToCover,
  pulseFront,
  rateToReach,
} from "@omadia/light";

export { axisAt, type Cone, coneMask, halfWidthAt, litAt } from "@omadia/light";

const SLOPE = 0.45;
/** never quite shut: a closed slit would be no light at all */
const MIN_OPEN = 0.14;

export function coneFor(
  width: number,
  aim: { x: number; y: number },
  progress: number,
): Cone {
  return {
    aimX: aim.x,
    aimY: Math.max(1, aim.y),
    slope: SLOPE,
    // Proportions of the concept: a narrow slit, a third of the tile wide
    // where it lands.
    top: Math.max(28, width * 0.035),
    full: Math.max(280, width * 0.17),
    // Slow at first: the middle is fully in the light only near the end.
    open: MIN_OPEN + (1 - MIN_OPEN) * Math.min(1, Math.max(0, progress)) ** 1.6,
  };
}

export interface ForgeLight {
  /** where the light falls, in pane px, and how far the build is */
  aim(target: { x: number; y: number }, progress: number): void;
  /** a sign from idaria: a pulse of light runs down the beam */
  pulse(): void;
  /**
   * The turn is over. A fast pulse runs down the beam and the panel shows
   * behind it, top to bottom; then the slit opens until the whole tile stands
   * in the light, while the light fades and the dust blows out.
   */
  leave(): void;
  destroy(): void;
}

/** How fast the panel takes the air with it when it arrives, px/s. */
const LEAVE_GUST = 280;
/** How long the sweep takes from the top edge past the bottom of the tile. */
export const SWEEP_MS = 450;
/** The light starts to open as the sweep nears the bottom. */
const WIDEN_AFTER_MS = 300;
/** How long the light takes to open over the whole panel. */
export const REVEAL_MS = 1300;
/** The soft edge of the reveal, px: keep in step with the mask's feather. */
export const REVEAL_FEATHER = 48;

const easeInOut = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

/**
 * How far the light has come over the arriving panel. `front`: the sweep's
 * front in px from the top edge, the panel shows above it. `done`: the light
 * covers the whole tile, nothing hides the panel any more.
 */
export interface Reveal {
  front: number;
  done: boolean;
}

/** The cone as it stands this frame, for whatever it lights. */
export type OnCone = (
  cone: Cone,
  width: number,
  height: number,
  reveal: Reveal | null,
) => void;

/** Null when there is no WebGL: the caller keeps the still cone. */
export function startForgeLight(
  canvas: HTMLCanvasElement,
  opts: { reduced: boolean; dust: boolean; onCone: OnCone },
): ForgeLight | null {
  let aim = { x: 0, y: 0 };
  let progress = 0;
  // The slit opens smoothly, whatever steps the progress takes.
  let shown = 0;
  let leftAt: number | null = null;
  let rate = 0;
  let fading = false;
  const light = createLight(canvas, {
    reduced: opts.reduced,
    // A tile is smaller than a window: fewer motes keep the same air.
    dust: opts.dust ? 150 : false,
    cone: ({ width, height, dt }) => {
      shown = opts.reduced
        ? progress
        : shown + (progress - shown) * Math.min(1, dt / 900);
      const cone = coneFor(width, aim, shown);
      if (leftAt === null) {
        opts.onCone(cone, width, height, null);
        return cone;
      }
      const elapsed = performance.now() - leftAt;
      if (rate === 0) {
        // Past the bottom edge with its soft edge, in exactly the sweep's time.
        rate = rateToReach(cone, height + REVEAL_FEATHER * 2, SWEEP_MS / 1000);
        light?.sweep(rate);
      }
      // Wide enough that every corner of the tile stands in the light.
      const t = Math.min(1, Math.max(0, elapsed - WIDEN_AFTER_MS) / REVEAL_MS);
      if (t > 0 && !fading) {
        fading = true;
        // The light gives way as it opens: by day its patch would cover the panel.
        light?.gain(0);
      }
      const cover = openToCover(
        cone,
        { left: 0, top: 0, width, height },
        REVEAL_FEATHER * 2,
      );
      cone.open += (cover - cone.open) * easeInOut(t);
      opts.onCone(cone, width, height, {
        front: pulseFront(cone, elapsed / 1000, rate),
        done: t >= 1,
      });
      return cone;
    },
  });
  if (!light) return null;
  return {
    aim(target, p) {
      aim = target;
      progress = Math.max(progress, p);
    },
    pulse: () => light.pulse(),
    leave() {
      progress = 1;
      // Reduced motion: no sweep and no opening, the panel is simply there.
      if (opts.reduced || leftAt !== null) return;
      leftAt = performance.now();
      light.gust(LEAVE_GUST);
    },
    destroy: () => light.destroy(),
  };
}
