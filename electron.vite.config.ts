import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { searchForWorkspaceRoot } from "vite";

// @omadia/canvas-core and @omadia/light are file: links to a sibling repo;
// the dev server only serves files under its allow list, so allow wherever
// the links point.
const linked = ["canvas-core", "light"].map((name) =>
  realpathSync(resolve(import.meta.dirname, `node_modules/@omadia/${name}`)),
);

export default defineConfig({
  // ws is a devDependency, so it is not auto-externalized; bundling it bakes
  // in the optional bufferutil import and the main process fails at boot.
  main: { plugins: [externalizeDepsPlugin({ include: ["ws"] })] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [react()],
    server: {
      fs: { allow: [searchForWorkspaceRoot(process.cwd()), ...linked] },
    },
  },
});
