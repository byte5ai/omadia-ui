import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The renderer imports the protocol schemas from ../docs/protocol/schema —
// outside the renderer root, so the dev server needs the repo root allowed.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  // Externalize node_modules deps for main/preload (the electron-vite default).
  // `ws` is a devDependency (not auto-externalized), so include it explicitly —
  // otherwise it's bundled and its optional `bufferutil` import is baked in →
  // "Could not resolve bufferutil" at boot. Externalized, ws is required at
  // runtime and its WS_NO_BUFFER_UTIL fallback (wsEnv.ts) applies cleanly.
  main: { plugins: [externalizeDepsPlugin({ include: ['ws'] })] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [react()],
    server: { fs: { allow: [repoRoot] } },
  },
});
