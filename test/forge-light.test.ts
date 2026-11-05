import { describe, expect, it } from "vitest";

import {
  axisAt,
  coneFor,
  coneMask,
  halfWidthAt,
  litAt,
} from "../src/renderer/src/lib/forge-light";

const aim = { x: 600, y: 400 };

describe("forge light", () => {
  it("falls from the top right onto the middle", () => {
    const cone = coneFor(1200, aim, 0.5);
    expect(axisAt(cone, aim.y)).toBe(aim.x);
    expect(axisAt(cone, 0)).toBeGreaterThan(aim.x);
    expect(litAt(cone, aim.x, aim.y)).toBe(1);
  });

  it("opens with the build, never quite shut", () => {
    const early = coneFor(1200, aim, 0);
    const late = coneFor(1200, aim, 1);
    expect(halfWidthAt(early, aim.y)).toBeGreaterThan(0);
    expect(halfWidthAt(late, aim.y)).toBeGreaterThan(
      halfWidthAt(early, aim.y) * 4,
    );
    // Far to the side of the middle: dark early, lit at the end.
    expect(litAt(early, aim.x - 150, aim.y)).toBe(0);
    expect(litAt(late, aim.x - 150, aim.y)).toBe(1);
  });

  it("masks a box with the cone's two edges", () => {
    const cone = coneFor(1200, aim, 0.3);
    const mask = coneMask(cone, {
      left: 360,
      top: 340,
      width: 480,
      height: 120,
    });
    const layers = mask.split("linear-gradient(").slice(1);
    expect(layers).toHaveLength(2);
    for (const l of layers) expect(l).toMatch(/transparent .*px, #000 .*px\)/);
  });
});
