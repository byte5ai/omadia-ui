import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TOKEN_TO_CSSVAR } from '../../src/renderer/src/render/scene/tokenMap.js';

// Parity guard: every scene colorToken the renderer might receive must map to a
// Lume CSS variable, else the rasteriser would silently draw it transparent.
describe('scene token map parity with the synced schema', () => {
  it('covers every colorToken (except transparent)', () => {
    const schemaPath = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/protocol/schema/scene.schema.json');
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as { $defs: { colorToken: { enum: string[] } } };
    const tokens = schema.$defs.colorToken.enum.filter((t) => t !== 'transparent');
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(TOKEN_TO_CSSVAR[token], `missing CSS-var mapping for scene token '${token}'`).toBeTruthy();
    }
  });
});
