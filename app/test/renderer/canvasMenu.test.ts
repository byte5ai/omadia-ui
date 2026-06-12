import { beforeEach, describe, expect, it } from 'vitest';
import {
  extractRootMenu,
  loadStoredMenu,
  storeMenu,
} from '../../src/renderer/src/store/canvasMenu.js';

const memStorage = (): Storage => {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
};

describe('canvasMenu', () => {
  beforeEach(() => {
    globalThis.localStorage = memStorage();
  });

  it('finds a toolbar that is a direct child of the root container', () => {
    const menu = { type: 'toolbar', id: 'root-menu', items: ['a'] };
    const tree = { type: 'container', children: [{ type: 'text' }, menu] };
    expect(extractRootMenu(tree)).toBe(menu);
  });

  it('ignores a toolbar nested deeper than a direct child', () => {
    const tree = {
      type: 'container',
      children: [{ type: 'container', children: [{ type: 'toolbar', id: 'nested' }] }],
    };
    expect(extractRootMenu(tree)).toBeNull();
  });

  it("returns null when the root type is 'table'", () => {
    expect(extractRootMenu({ type: 'table', children: [{ type: 'toolbar' }] })).toBeNull();
  });

  it("returns null when the root type is 'tabs'", () => {
    expect(extractRootMenu({ type: 'tabs', children: [{ type: 'toolbar' }] })).toBeNull();
  });

  it('returns null for a string tree', () => {
    expect(extractRootMenu('toolbar')).toBeNull();
  });

  it('returns null for null', () => {
    expect(extractRootMenu(null)).toBeNull();
  });

  it('returns null when the container has no children array', () => {
    expect(extractRootMenu({ type: 'container' })).toBeNull();
    expect(extractRootMenu({ type: 'container', children: 'nope' })).toBeNull();
  });

  it('returns the first direct-child toolbar when two are present', () => {
    const tree = {
      type: 'container',
      children: [
        { type: 'toolbar', id: 'first' },
        { type: 'toolbar', id: 'second' },
      ],
    };
    expect(extractRootMenu(tree)?.id).toBe('first');
  });

  it('roundtrips a stored menu', () => {
    const sessionId = 'session-a';
    const menu = { type: 'toolbar', id: 'persisted', actions: [{ type: 'button' }] };
    storeMenu(sessionId, menu);
    expect(loadStoredMenu(sessionId)).toEqual(menu);
  });

  it('removes the stored menu when null is written', () => {
    const sessionId = 'session-b';
    storeMenu(sessionId, { type: 'toolbar', id: 'gone' });
    storeMenu(sessionId, null);
    expect(loadStoredMenu(sessionId)).toBeNull();
  });

  it('returns null and removes the key when storage contains corrupt JSON', () => {
    const sessionId = 'session-c';
    const key = `omadia.ui-menu.${sessionId}`;
    localStorage.setItem(key, '{not-json');
    expect(loadStoredMenu(sessionId)).toBeNull();
    expect(localStorage.getItem(key)).toBeNull();
  });

  it('isolates stored menus by session id', () => {
    storeMenu('session-1', { type: 'toolbar', id: 'one' });
    storeMenu('session-2', { type: 'toolbar', id: 'two' });
    expect(loadStoredMenu('session-1')).toEqual({ type: 'toolbar', id: 'one' });
    expect(loadStoredMenu('session-2')).toEqual({ type: 'toolbar', id: 'two' });
  });
});
