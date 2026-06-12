import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { SessionPersistence } from './canvasSocket.js';

/** canvasSessionId persistence in userData — survives app restarts (WT5 later). */
export function createFileSessionStore(userDataDir: string): SessionPersistence {
  const file = join(userDataDir, 'canvas-session.json');
  return {
    load(): string | undefined {
      try {
        const parsed = JSON.parse(readFileSync(file, 'utf8')) as { canvasSessionId?: string };
        return typeof parsed.canvasSessionId === 'string' ? parsed.canvasSessionId : undefined;
      } catch {
        return undefined;
      }
    },
    save(canvasSessionId: string): void {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify({ canvasSessionId }), 'utf8');
    },
  };
}
