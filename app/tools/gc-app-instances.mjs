#!/usr/bin/env node
/**
 * GC stale Omadia-UI dev app instances before launching a new one.
 *
 * HARD RULE (Marcel): only ever ONE app instance — old Electron processes
 * accumulate and eat RAM. Run automatically via the `predev` hook.
 *
 * Scoped + safe:
 *  - Matches ONLY processes whose command line contains THIS app directory's
 *    path, so other checkouts / VS Code / Slack are never touched (no blanket
 *    `pkill electron`).
 *  - The real Electron process is `…/electron/dist/Electron.app/Contents/MacOS/
 *    Electron`, NOT the `.bin/electron` launcher — match the real binary.
 *  - Kills MAIN processes (no `--type=`); helper procs (renderer/gpu/utility)
 *    die with their main. Also kills any lingering `electron-vite` watcher.
 */
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const self = process.pid;

let lines = '';
try {
  // -Axww: every process, full (untruncated) command. macOS + Linux compatible.
  lines = execSync('ps -Axww -o pid=,command=', { encoding: 'utf8' });
} catch {
  process.exit(0); // ps unavailable — nothing to GC, never block dev
}

const victims = [];
for (const line of lines.split('\n')) {
  const m = line.match(/^\s*(\d+)\s+(.*)$/);
  if (!m) continue;
  const pid = Number(m[1]);
  const cmd = m[2];
  if (pid === self) continue;
  if (!cmd.includes(appDir)) continue; // scope: this worktree only
  const isElectronMain =
    cmd.includes('Electron.app/Contents/MacOS/Electron') && !cmd.includes('--type=');
  const isViteWatcher = cmd.includes('electron-vite');
  if (isElectronMain || isViteWatcher) victims.push(pid);
}

for (const pid of victims) {
  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
}

if (victims.length > 0) {
  console.log(`[gc] killed ${victims.length} stale omadia-ui app instance(s): ${victims.join(', ')}`);
}
