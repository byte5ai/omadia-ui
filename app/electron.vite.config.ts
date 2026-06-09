import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The renderer imports the protocol schemas from ../docs/protocol/schema —
// outside the renderer root, so the dev server needs the repo root allowed.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    server: { fs: { allow: [repoRoot] } },
  },
});
