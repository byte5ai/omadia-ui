import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

// The renderer imports the protocol schemas from ../docs/protocol/schema —
// outside the renderer root, so the dev server needs the repo root allowed.
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Allow the REAL node_modules location too: in a normal checkout this is inside
// repoRoot (a no-op), but when node_modules is a symlink (monorepo / git
// worktree dev), assets like @fontsource woff2 resolve to the link target and
// would otherwise fall outside the fs allow list.
const nodeModulesReal = (() => {
  try {
    return realpathSync(fileURLToPath(new URL('./node_modules', import.meta.url)));
  } catch {
    return null;
  }
})();
const fsAllow = nodeModulesReal ? [repoRoot, nodeModulesReal] : [repoRoot];

// `ws` lazily require()s the optional native addons bufferutil / utf-8-validate.
// If `ws` is bundled into the main process, the bundler tries to resolve those
// addons at build time and the main process crashes at launch ("bufferutil").
// Keep `ws` (and the optional addons) external so they load from node_modules
// at runtime, where ws's try/catch falls back to its pure-JS path cleanly.
const wsExternals = ['ws', 'bufferutil', 'utf-8-validate'];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { external: wsExternals } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { external: wsExternals } },
  },
  renderer: {
    plugins: [react()],
    server: { fs: { allow: fsAllow } },
  },
});
