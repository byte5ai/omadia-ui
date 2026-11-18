import { type Cone, coneMask } from "@omadia/light";

import { type Reveal, REVEAL_FEATHER } from "./forge-light";

const setMask = (el: HTMLElement, mask: string, composite: string): void => {
  el.style.maskImage = mask;
  el.style.webkitMaskImage = mask;
  el.style.maskComposite = mask ? composite : "";
  el.style.setProperty(
    "-webkit-mask-composite",
    mask ? (composite === "intersect" ? "source-in" : "source-over") : "",
  );
};

/**
 * The arriving panel shows only where the light has reached it: above the
 * sweep's front and inside the cone. Everywhere else the ground of the build
 * stays, so the room never turns grey in between. Once the light covers the
 * tile, both masks go and the ground with them.
 */
export function revealPanel(
  focus: HTMLElement | null,
  cone: Cone | null,
  reveal: Reveal | null,
  size: { width: number; height: number },
): void {
  const panel =
    focus?.parentElement?.querySelector<HTMLElement>(":scope > .pane");
  const ground = focus?.querySelector<HTMLElement>(":scope > .focus-ground");
  const showing = cone && reveal && !reveal.done;
  if (ground) ground.style.opacity = !reveal || showing ? "" : "0";
  if (!panel) return;
  if (!showing) {
    setMask(panel, "", "");
    if (ground) setMask(ground, "", "");
    return;
  }
  const box = { left: 0, top: 0, ...size };
  const f = REVEAL_FEATHER;
  const front = reveal.front;
  // Marks the panel for good: when the light has gone, its own fade-in
  // must not start over.
  panel.dataset.revealed = "";
  setMask(
    panel,
    `${coneMask(cone, box, f)}, linear-gradient(180deg, #000 ${front - f}px, transparent ${front + f}px)`,
    "intersect",
  );
  if (ground) {
    setMask(
      ground,
      `${coneMask(cone, box, f, true)}, linear-gradient(180deg, transparent ${front - f}px, #000 ${front + f}px)`,
      "add",
    );
  }
}

/**
 * Takes every trace of a reveal off panel and ground. For when the light goes
 * away or starts over (a remount, effects switched): the ground of the build
 * must stand whole again, not stay hidden as at the end of a reveal.
 */
export function clearReveal(focus: HTMLElement | null): void {
  const panel =
    focus?.parentElement?.querySelector<HTMLElement>(":scope > .pane");
  const ground = focus?.querySelector<HTMLElement>(":scope > .focus-ground");
  if (panel) setMask(panel, "", "");
  if (ground) {
    setMask(ground, "", "");
    ground.style.opacity = "";
  }
}
