import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createSessionVault, type CookieCrypt } from '../../src/main/sessionVault.js';

/** stand-in for Electron safeStorage — reversible, but NOT the plaintext */
const fakeCrypt: CookieCrypt = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(`enc:${plain}`, 'utf8'),
  decryptString: (buf) => {
    const s = buf.toString('utf8');
    if (!s.startsWith('enc:')) throw new Error('bad ciphertext');
    return s.slice(4);
  },
};

const noCrypt: CookieCrypt = {
  isEncryptionAvailable: () => false,
  encryptString: () => {
    throw new Error('unavailable');
  },
  decryptString: () => {
    throw new Error('unavailable');
  },
};

const dirs: string[] = [];
const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'omadia-vault-'));
  dirs.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

const ORIGIN = 'http://127.0.0.1:8080';
const COOKIE = 'omadia_session=tok';

describe('sessionVault', () => {
  it('round-trips a session and never writes the plaintext cookie to disk', () => {
    const dir = tmp();
    const vault = createSessionVault(dir, fakeCrypt);
    vault.save(ORIGIN, COOKIE, 2_000_000_000);
    expect(vault.load(ORIGIN)).toEqual({ cookie: COOKIE, expiresAt: 2_000_000_000 });
    const onDisk = readFileSync(join(dir, 'sessions.json'), 'utf8');
    expect(onDisk).not.toContain(COOKIE);
    // a fresh instance (new app run) decrypts from disk
    expect(createSessionVault(dir, fakeCrypt).load(ORIGIN)).toEqual({
      cookie: COOKIE,
      expiresAt: 2_000_000_000,
    });
  });

  it('drops an expired session on load', () => {
    const vault = createSessionVault(tmp(), fakeCrypt);
    vault.save(ORIGIN, COOKIE, Math.floor(Date.now() / 1000) - 10);
    expect(vault.load(ORIGIN)).toBeNull();
  });

  it('clear removes the entry for that origin only', () => {
    const vault = createSessionVault(tmp(), fakeCrypt);
    vault.save(ORIGIN, COOKIE);
    vault.save('https://other.example.com', 'omadia_session=other');
    vault.clear(ORIGIN);
    expect(vault.load(ORIGIN)).toBeNull();
    expect(vault.load('https://other.example.com')?.cookie).toBe('omadia_session=other');
  });

  it('degrades to in-memory when OS encryption is unavailable', () => {
    const dir = tmp();
    const vault = createSessionVault(dir, noCrypt);
    vault.save(ORIGIN, COOKIE);
    expect(vault.load(ORIGIN)?.cookie).toBe(COOKIE); // this run works
    expect(() => readFileSync(join(dir, 'sessions.json'))).toThrow(); // nothing on disk
    expect(createSessionVault(dir, noCrypt).load(ORIGIN)).toBeNull(); // next run: gone
  });

  it('drops an undecryptable entry (Keychain reset) instead of throwing', () => {
    const dir = tmp();
    createSessionVault(dir, fakeCrypt).save(ORIGIN, COOKIE);
    const otherKey: CookieCrypt = {
      ...fakeCrypt,
      decryptString: () => {
        throw new Error('key mismatch');
      },
    };
    expect(createSessionVault(dir, otherKey).load(ORIGIN)).toBeNull();
  });
});
