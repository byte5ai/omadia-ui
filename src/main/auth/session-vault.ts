import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { StoredCookie } from "./auth-api";

/**
 * The `omadia_session` cookie per server origin, encrypted at rest through
 * Electron safeStorage. Without OS encryption the vault stays in memory, so
 * a session lasts one app run and never lands on disk in plain text.
 */

export interface CookieCrypt {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface SessionVault {
  load(origin: string): StoredCookie | null;
  save(origin: string, session: StoredCookie): void;
  clear(origin: string): void;
}

interface FileEntry {
  cookie: string;
  expiresAt?: number;
}

const isExpired = (s: StoredCookie): boolean =>
  s.expiresAt !== undefined && s.expiresAt * 1000 <= Date.now();

export function createSessionVault(
  userDataDir: string,
  crypt: CookieCrypt,
): SessionVault {
  const file = join(userDataDir, "sessions.json");
  const memory = new Map<string, StoredCookie>();

  const readEntries = (): Record<string, FileEntry> => {
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, FileEntry>)
        : {};
    } catch {
      return {};
    }
  };
  const writeEntries = (entries: Record<string, FileEntry>): void => {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify(entries), "utf8");
  };

  const decrypt = (entry: FileEntry): StoredCookie | null => {
    try {
      return {
        cookie: crypt.decryptString(Buffer.from(entry.cookie, "base64")),
        ...(typeof entry.expiresAt === "number"
          ? { expiresAt: entry.expiresAt }
          : {}),
      };
    } catch {
      return null;
    }
  };

  const vault: SessionVault = {
    load(origin) {
      const cached = memory.get(origin);
      if (cached && !isExpired(cached)) return cached;
      if (!crypt.isEncryptionAvailable()) return null;
      const entry = readEntries()[origin];
      const session = entry ? decrypt(entry) : null;
      if (!session || isExpired(session)) {
        if (entry) vault.clear(origin);
        return null;
      }
      memory.set(origin, session);
      return session;
    },
    save(origin, session) {
      memory.set(origin, session);
      if (!crypt.isEncryptionAvailable()) return;
      const entries = readEntries();
      entries[origin] = {
        cookie: crypt.encryptString(session.cookie).toString("base64"),
        ...(session.expiresAt !== undefined
          ? { expiresAt: session.expiresAt }
          : {}),
      };
      writeEntries(entries);
    },
    clear(origin) {
      memory.delete(origin);
      if (!crypt.isEncryptionAvailable()) return;
      const entries = readEntries();
      if (!(origin in entries)) return;
      delete entries[origin];
      writeEntries(entries);
    },
  };
  return vault;
}
