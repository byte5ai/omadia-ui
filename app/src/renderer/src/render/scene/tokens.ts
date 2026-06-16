/**
 * omadia-canvas-protocol/1.1 — scene colour tokens → Lume CSS variables.
 *
 * A `scene` may only reference theme tokens + the active Lume palette
 * (lumens-spec.md §3); the whitelist schema already rejects free-form colours.
 * The rasteriser draws to canvas2d, which needs concrete colour values, so we
 * resolve each token to its Lume CSS custom property at draw time — a scene
 * therefore re-themes for free when the palette is bound (palette.ts).
 */
import { TOKEN_TO_CSSVAR } from './tokenMap.js';

export { TOKEN_TO_CSSVAR, REGISTER_TO_CSSVAR } from './tokenMap.js';

export type TokenResolver = (token: string | undefined) => string;

/** Build a resolver that reads computed Lume CSS variables off an element.
 *  Unknown / absent tokens fall back to a safe on-theme value. */
export function makeTokenResolver(el: Element): TokenResolver {
  const computed = getComputedStyle(el);
  return (token) => {
    if (!token || token === 'transparent') return 'transparent';
    const cssVar = TOKEN_TO_CSSVAR[token];
    if (!cssVar) return 'transparent';
    const value = computed.getPropertyValue(cssVar).trim();
    return value || 'currentColor';
  };
}
