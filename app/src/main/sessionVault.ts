import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Session persistence for the native login (issue #7): the `omadia_session`
 * cookie per server origin, encrypted at rest via Electron `safeStorage`
 * (Keychain-backed on macOS). Without OS encryption the vault degrades to
 * in-memory — a session then lasts one app run, never plaintext on disk.
 */

/** the safeStorage surface we use, injected so tests run without electron */
export interface CookieCrypt {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface StoredSession {
  cookie: string;
  /** unix seconds; absent = unknown (validated against /me instead) */
  expiresAt?: number;
}

export interface SessionVault {
  load(origin: string): StoredSession | null;
  save(origin: string, cookie: string, expiresAt?: number): void;
  clear(origin: string): void;
}

interface FileEntry {
  /** base64 of the safeStorage-encrypted cookie */
  cookie: string;
  expiresAt?: number;
}

const expired = (s: StoredSession): boolean =>
  s.expiresAt !== undefined && s.expiresAt * 1000 <= Date.now();

export function createSessionVault(userDataDir: string, crypt: CookieCrypt): SessionVault {
  const file = join(userDataDir, 'sessions.json');
  const memory = new Map<string, StoredSession>();

  const readFile = (): Record<string, FileEntry> => {
    try {
      const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
      return typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, FileEntry>)
        : {};
    } catch {
      return {};
    }
  };
  const writeFileEntries = (entries: Record<string, FileEntry>): void => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(entries), 'utf8');
  };

  return {
    load(origin: string): StoredSession | null {
      const mem = memory.get(origin);
      if (mem) {
        if (!expired(mem)) return mem;
        memory.delete(origin);
        return null;
      }
      if (!crypt.isEncryptionAvailable()) return null;
      const entry = readFile()[origin];
      if (!entry || typeof entry.cookie !== 'string') return null;
      let session: StoredSession;
      try {
        session = {
          cookie: crypt.decryptString(Buffer.from(entry.cookie, 'base64')),
          ...(typeof entry.expiresAt === 'number' ? { expiresAt: entry.expiresAt } : {}),
        };
      } catch {
        // key changed (new machine/Keychain reset) — drop the undecryptable entry
        this.clear(origin);
        return null;
      }
      if (expired(session)) {
        this.clear(origin);
        return null;
      }
      return session;
    },
    save(origin: string, cookie: string, expiresAt?: number): void {
      const session: StoredSession = { cookie, ...(expiresAt !== undefined ? { expiresAt } : {}) };
      memory.set(origin, session);
      if (!crypt.isEncryptionAvailable()) return;
      const entries = readFile();
      entries[origin] = {
        cookie: crypt.encryptString(cookie).toString('base64'),
        ...(expiresAt !== undefined ? { expiresAt } : {}),
      };
      writeFileEntries(entries);
    },
    clear(origin: string): void {
      memory.delete(origin);
      if (!crypt.isEncryptionAvailable()) return;
      const entries = readFile();
      if (origin in entries) {
        delete entries[origin];
        writeFileEntries(entries);
      }
    },
  };
}
