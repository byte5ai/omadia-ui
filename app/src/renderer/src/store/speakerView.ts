/**
 * Who a message is from (spec 2042 INV-3/4, issue #52): pure view logic for
 * the agent directory, the speaker of an answer and `system` notices. The
 * server stamps the speaker and renders the notice; everything on the wire is
 * untrusted input here, so it is checked, capped and reduced to known fields
 * before it reaches a component.
 */

import type {
  AgentDirectoryEntry,
  Speaker,
  SystemNoticeWire,
} from '../../../shared/protocol.js';

const MAX_AGENTS = 200;
const MAX_NAME = 80;
const MAX_ID = 128;
const MAX_TEXT = 400;
const MAX_URL = 2048;

const text = (v: unknown, max: number): string | undefined =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim().slice(0, max) : undefined;

/**
 * An avatar URL the renderer may load: `https:` as is, a server-relative path
 * resolved against the server's http(s) origin. Anything else (`javascript:`,
 * `file:`, protocol-relative, plain `http:` to a remote host) is dropped: the
 * initials stand in. `http:` is allowed for loopback only (local dev server).
 */
export function avatarSrc(avatarUrl: string | undefined, serverUrl: string | undefined): string | undefined {
  if (avatarUrl === undefined) return undefined;
  try {
    if (avatarUrl.startsWith('/') && !avatarUrl.startsWith('//')) {
      if (serverUrl === undefined) return undefined;
      const origin = new URL(serverUrl.replace(/^ws(s?):/i, 'http$1:')).origin;
      return new URL(avatarUrl, origin).toString();
    }
    const url = new URL(avatarUrl);
    if (url.protocol === 'https:') return url.toString();
    if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      return url.toString();
    }
  } catch {
    // not a URL
  }
  return undefined;
}

/** `Mira Schneider` → `MS`, `mira` → `M` — the avatar when there is no image. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  const letters = [parts[0], parts.length > 1 ? parts[parts.length - 1] : undefined]
    .map((p) => (p ? Array.from(p)[0] : undefined))
    .filter((c): c is string => c !== undefined);
  return letters.join('').toUpperCase() || '?';
}

/**
 * The directory as the server sent it, reduced to complete entries: one per
 * id, known fields only, bounded. A malformed entry is dropped.
 *
 * Two wire shapes are read: the canvas channel's camelCase entry (`id`,
 * `displayName`, `description`, `avatarUrl`) and the kernel's directory entry
 * (`id`, `slug`, `display_name`, `short_description`, `avatar_url`, `archetype`).
 * `agentId` of a turn is the entry's `id`. Only a kernel that predates the
 * `id` in the directory sends none; the slug (unique) then names the agent, so
 * a turn still addresses exactly this one.
 */
export function agentDirectoryView(raw: unknown): AgentDirectoryEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AgentDirectoryEntry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const e = item as Record<string, unknown>;
    const slug = text(e['slug'], MAX_ID);
    const id = text(e['id'], MAX_ID) ?? slug;
    const displayName = text(e['displayName'], MAX_NAME) ?? text(e['display_name'], MAX_NAME);
    if (id === undefined || slug === undefined || displayName === undefined || seen.has(id)) continue;
    seen.add(id);
    const avatarUrl = text(e['avatarUrl'], MAX_URL) ?? text(e['avatar_url'], MAX_URL);
    const description = text(e['description'], MAX_TEXT) ?? text(e['short_description'], MAX_TEXT);
    const archetype = text(e['archetype'], MAX_ID);
    out.push({
      id,
      slug,
      displayName,
      ...(avatarUrl !== undefined ? { avatarUrl } : {}),
      ...(description !== undefined ? { description } : {}),
      ...(archetype !== undefined ? { archetype } : {}),
    });
    if (out.length >= MAX_AGENTS) break;
  }
  return out;
}

/** The slug of the default agent (`defaultAgent: {slug}`), or `null` when
 *  there is none (`{slug: null, notice}`) or the field is absent/malformed. */
export function defaultAgentSlug(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null;
  return text((raw as Record<string, unknown>)['slug'], MAX_ID) ?? null;
}

/** The agent a canvas without a choice starts on: the directory's default
 *  agent when it is listed, else the only agent there is, else none — the
 *  client never picks among several. */
export function preselectedAgent(
  agents: readonly AgentDirectoryEntry[],
  defaultSlug: string | null,
): AgentDirectoryEntry | undefined {
  if (defaultSlug !== null) {
    const listed = agents.find((a) => a.slug === defaultSlug);
    if (listed !== undefined) return listed;
  }
  return agents.length === 1 ? agents[0] : undefined;
}

/** A speaker from the wire, or `null` when absent or malformed (a server that
 *  predates agents sends none; the client never invents one). */
export function speakerView(raw: unknown): Speaker | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Record<string, unknown>;
  if (s['kind'] === 'system') return { kind: 'system' };
  if (s['kind'] !== 'agent') return null;
  const agentId = text(s['agentId'], MAX_ID);
  const slug = text(s['slug'], MAX_ID);
  const displayName = text(s['displayName'], MAX_NAME);
  if (agentId === undefined || slug === undefined || displayName === undefined) return null;
  const avatarUrl = text(s['avatarUrl'], MAX_URL);
  return { kind: 'agent', agentId, slug, displayName, ...(avatarUrl !== undefined ? { avatarUrl } : {}) };
}

/** What a `system` notice shows: its text, set apart from every agent message. */
export interface SystemNoticeView {
  code: string;
  text: string;
  /** the agent the notice names (INV-7), when it names one */
  agentName?: string;
}

export function systemNoticeView(raw: SystemNoticeWire | unknown): SystemNoticeView | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const n = raw as Record<string, unknown>;
  const body = text(n['text'], MAX_TEXT);
  const code = text(n['code'], MAX_ID);
  if (body === undefined || code === undefined) return null;
  const agent = typeof n['agent'] === 'object' && n['agent'] !== null ? (n['agent'] as Record<string, unknown>) : undefined;
  const agentName = text(agent?.['displayName'], MAX_NAME);
  return { code, text: body, ...(agentName !== undefined ? { agentName } : {}) };
}

/** A notice the client itself raises (no server involved): the same shape, so
 *  one component renders both. */
export function localSystemNotice(code: string, body: string): SystemNoticeView {
  return { code, text: body };
}
