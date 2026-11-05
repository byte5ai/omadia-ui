import {
  type CSSProperties,
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useStore } from "../lib/create-store";
import { blueprintOf } from "../lib/forge-layout";
import {
  axisAt,
  type Cone,
  coneMask,
  type ForgeLight,
  halfWidthAt,
  litAt,
  startForgeLight,
} from "../lib/forge-light";
import {
  latestSentence,
  PHASE_GLYPHS,
  PHASE_LABEL,
  PHASE_WORDS,
  phaseOf,
  progressOf,
} from "../lib/forge-phase";
import { type GlyphPlayer, startGlyphs } from "../lib/glyph-player";
import { cleanProse } from "../lib/prose";
import { withoutQuestions } from "../lib/tree";
import { abort, canvasStore } from "../state/canvases";
import { focusPane } from "../state/workspace";
import { LightCone } from "./light-cone";

const WORD_MS = 2800;

const reducedMotion = (): boolean =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const clock = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The other way to show a canvas being built: everything gathers in the
 * middle of the tile, under the light. A line icon that turns into the next
 * step, a word for what omadia is doing, its latest sentence, a bar that only
 * moves forward. The light falls on them from a slit at the top edge; the
 * further the build, the wider the slit, the more of the middle is lit.
 */
export function CanvasFocus({ slotKey }: { slotKey: string }): ReactElement {
  const rt = useStore(canvasStore, (s) => s.runtime[slotKey]);
  const paneRef = useRef<HTMLElement>(null);
  const lightRef = useRef<HTMLCanvasElement>(null);
  const slitRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const litRef = useRef<HTMLDivElement>(null);
  const glyphRef = useRef<HTMLCanvasElement>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const playerRef = useRef<GlyphPlayer | null>(null);
  const forgeLightRef = useRef<ForgeLight | null>(null);
  const coneRef = useRef<{ cone: Cone; x: number; y: number } | null>(null);
  const progressRef = useRef(0);
  const [hasLight, setHasLight] = useState(true);
  const [reduced] = useState(reducedMotion);
  const [now, setNow] = useState(() => Date.now());
  const [startedAt] = useState(now);

  const tree = rt?.canvas.tree ?? null;
  const shown = useMemo(() => withoutQuestions(tree), [tree]);
  const regions = useMemo(() => blueprintOf(shown), [shown]);
  const loading = regions.filter((b) => b.loading).length;
  const rawProse = rt?.canvas.prose ?? "";
  const prose = useMemo(() => cleanProse(rawProse), [rawProse]);
  const signal = {
    hasTree: tree !== null,
    proseLength: prose.length,
    total: regions.length,
    loading,
  };
  const phase = phaseOf(signal);

  // When the phase began, or the last region was filled: the bar's clock.
  const [mark, setMark] = useState({ phase, loading, at: now });
  if (mark.phase !== phase || mark.loading !== loading) {
    setMark({ phase, loading, at: now });
  }
  const target = progressOf(signal, phase, now - mark.at);
  const [progress, setProgress] = useState(0);
  if (target > progress) setProgress(target);

  const words = PHASE_WORDS[phase];
  const turn = reduced ? 0 : Math.floor((now - mark.at) / WORD_MS);
  const word = words[turn % words.length] ?? "";
  const [said, setSaid] = useState({ word, before: "", n: 0 });
  if (said.word !== word) {
    setSaid({ word, before: said.word, n: said.n + 1 });
  }
  const sentence = latestSentence(prose);

  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // The light: aimed at the middle each frame; what stands in it is lit.
  useEffect(() => {
    const canvas = lightRef.current;
    if (!canvas) return;
    const light = startForgeLight(canvas, {
      reduced,
      onCone: (cone) => {
        const pane = paneRef.current?.getBoundingClientRect();
        const text = textRef.current?.getBoundingClientRect();
        const glyph = glyphRef.current?.getBoundingClientRect();
        if (!pane || !text || !glyph) return;
        const aim = {
          x: text.left - pane.left + text.width / 2,
          y: glyph.top - pane.top + (text.bottom - glyph.top) / 2,
        };
        forgeLightRef.current?.aim(aim, progressRef.current);
        coneRef.current = {
          cone,
          x: glyph.left - pane.left,
          y: glyph.top - pane.top,
        };
        const slit = slitRef.current;
        if (slit) {
          const hw = halfWidthAt(cone, 0);
          slit.style.transform = `translateX(${axisAt(cone, 0) - hw}px)`;
          slit.style.width = `${hw * 2}px`;
        }
        const lit = litRef.current;
        if (lit) {
          const mask = coneMask(cone, {
            left: text.left - pane.left,
            top: text.top - pane.top,
            width: text.width,
            height: text.height,
          });
          lit.style.maskImage = mask;
          lit.style.webkitMaskImage = mask;
        }
      },
    });
    forgeLightRef.current = light;
    if (!light) setHasLight(false);
    return () => {
      light?.destroy();
      forgeLightRef.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    const canvas = glyphRef.current;
    if (!canvas) return;
    const player = startGlyphs(canvas, anchorRef.current, {
      reduced,
      lightAt: (x, y) => {
        const c = coneRef.current;
        return c ? litAt(c.cone, c.x + x, c.y + y) : 1;
      },
    });
    playerRef.current = player;
    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, [reduced]);

  useEffect(() => {
    playerRef.current?.play(PHASE_GLYPHS[phase]);
  }, [phase]);

  // Every sign from omadia runs down the beam as a pulse of light.
  const revision = rt?.canvas.lastApply?.revision;
  useEffect(() => {
    forgeLightRef.current?.pulse();
  }, [rawProse.length, revision, phase]);

  const count =
    phase === "fill" ? ` ${regions.length - loading}/${regions.length}` : "";

  const text = (lit: boolean): ReactNode => (
    <>
      <p className="focus-word" aria-hidden="true">
        {said.before ? (
          <span key={`out-${said.n}`} className="out">
            {said.before}…
          </span>
        ) : null}
        <span key={`in-${said.n}`} className="in">
          {said.word}…
        </span>
      </p>
      <p key={sentence} className="focus-line">
        {sentence}
      </p>
      <div
        className="focus-bar"
        style={{ "--p": progress } as CSSProperties}
        {...(lit
          ? {}
          : {
              role: "progressbar",
              "aria-label": "Fortschritt",
              "aria-valuemin": 0,
              "aria-valuemax": 100,
              "aria-valuenow": Math.round(progress * 100),
            })}
      >
        <i />
      </div>
      <p className="focus-meta">
        <span>
          {PHASE_LABEL[phase]}
          {count}
        </span>
        <span>{clock(now - startedAt)}</span>
      </p>
    </>
  );

  return (
    <section
      ref={paneRef}
      className={`focus${reduced ? " still" : ""}${hasLight ? "" : " no-light"}`}
      data-pane={slotKey}
      aria-label="omadia baut den Canvas"
      aria-busy="true"
      onMouseDown={() => focusPane(slotKey)}
    >
      {hasLight ? (
        <>
          <canvas ref={lightRef} className="focus-light" aria-hidden="true" />
          <span ref={slitRef} className="focus-slit" aria-hidden="true" />
        </>
      ) : (
        <LightCone height={0.8} />
      )}
      <header className="forge-head">
        {rt?.prompt ? <p className="forge-prompt">{rt.prompt}</p> : null}
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => abort(slotKey)}
        >
          Abbrechen
        </button>
      </header>
      <div className="focus-core">
        <div className="focus-glyph">
          <canvas ref={glyphRef} aria-hidden="true" />
          <span
            ref={anchorRef}
            className="forge-pen"
            data-dot-anchor={`pane:${slotKey}:center`}
            data-dot-size={5}
          />
        </div>
        <div ref={textRef} className="focus-text">
          {text(false)}
          {hasLight ? (
            <div ref={litRef} className="focus-lit" aria-hidden="true">
              {text(true)}
            </div>
          ) : null}
        </div>
      </div>
      <p className="sr-only" role="status">
        omadia baut die Ansicht: {PHASE_LABEL[phase]}
      </p>
    </section>
  );
}
