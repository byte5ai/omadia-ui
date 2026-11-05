import { realpathSync } from "node:fs";
import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import { searchForWorkspaceRoot } from "vite";

// @omadia/canvas-core is a file: link to a sibling repo; the dev server only
// serves files under its allow list, so allow wherever the link points.
const canvasCore = realpathSync(
  resolve(import.meta.dirname, "node_modules/@omadia/canvas-core"),
);

export default defineConfig({
  // ws is a devDependency, so it is not auto-externalized; bundling it bakes
  // in the optional bufferutil import and the main process fails at boot.
  main: { plugins: [externalizeDepsPlugin({ include: ["ws"] })] },
  preload: { plugins: [externalizeDepsPlugin()] },
  renderer: {
    plugins: [react()],
    server: {
      fs: { allow: [searchForWorkspaceRoot(process.cwd()), canvasCore] },
    },
  },
});
