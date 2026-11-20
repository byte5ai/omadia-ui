import { describe, expect, it } from 'vitest';
import {
  agentDirectoryView,
  avatarSrc,
  defaultAgentSlug,
  initialsOf,
  localSystemNotice,
  preselectedAgent,
  speakerView,
  systemNoticeView,
} from '../../src/renderer/src/store/speakerView.js';

// The kernel's `GET /api/v1/agents/directory?channel=web` body (S1 contract,
// middleware/src/routes/managementLayer.ts, kernel main 4ff997d20): snake_case,
// with the agent's `id`.
const KERNEL_DIRECTORY = {
  channel: 'web',
  agents: [
    { id: '6f1c0d52-8a3e-4c1b-9d57-2b0e4a7f1c33', slug: 'mira', display_name: 'Mira Schneider', short_description: 'Vertrieb', avatar_url: '/avatars/mira.png', archetype: 'standard' },
    { id: '0b9a7e14-55d2-4f0a-8c36-91d4e2a7b8c5', slug: 'ben', display_name: 'Ben', short_description: null, avatar_url: null, archetype: null },
  ],
  defaultAgent: { slug: 'mira' },
};

describe('agentDirectoryView', () => {
  it('reads the kernel directory entries; the agent id is the agent reference', () => {
    expect(agentDirectoryView(KERNEL_DIRECTORY.agents)).toEqual([
      { id: '6f1c0d52-8a3e-4c1b-9d57-2b0e4a7f1c33', slug: 'mira', displayName: 'Mira Schneider', avatarUrl: '/avatars/mira.png', description: 'Vertrieb', archetype: 'standard' },
      { id: '0b9a7e14-55d2-4f0a-8c36-91d4e2a7b8c5', slug: 'ben', displayName: 'Ben' },
    ]);
  });

  it('falls back to the slug only for a kernel that sends no id', () => {
    expect(agentDirectoryView([{ slug: 'mira', display_name: 'Mira' }])).toEqual([
      { id: 'mira', slug: 'mira', displayName: 'Mira' },
    ]);
  });

  it('reads the canvas-channel entries and keeps their id', () => {
    const out = agentDirectoryView([{ id: 'uuid-1', slug: 'mira', displayName: 'Mira', description: 'Sales' }]);
    expect(out).toEqual([{ id: 'uuid-1', slug: 'mira', displayName: 'Mira', description: 'Sales' }]);
  });

  it('drops incomplete and duplicate entries and anything that is not a list', () => {
    expect(
      agentDirectoryView([
        { slug: 'a' },
        { display_name: 'No slug' },
        'x',
        null,
        { slug: 'b', display_name: 'B' },
        { slug: 'b', display_name: 'B again' },
      ]),
    ).toEqual([{ id: 'b', slug: 'b', displayName: 'B' }]);
    expect(agentDirectoryView({ agents: [] })).toEqual([]);
    expect(agentDirectoryView(undefined)).toEqual([]);
  });

  it('bounds the list', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({ slug: `a${i}`, display_name: `A${i}` }));
    expect(agentDirectoryView(many)).toHaveLength(200);
  });
});

describe('defaultAgentSlug / preselectedAgent', () => {
  const agents = agentDirectoryView(KERNEL_DIRECTORY.agents);

  it('reads the default agent, null for "no default" and malformed input', () => {
    expect(defaultAgentSlug({ slug: 'mira' })).toBe('mira');
    expect(defaultAgentSlug({ slug: null, notice: 'no_agent' })).toBeNull();
    expect(defaultAgentSlug(undefined)).toBeNull();
    expect(defaultAgentSlug('mira')).toBeNull();
  });

  it('preselects the listed default agent', () => {
    expect(preselectedAgent(agents, 'ben')?.slug).toBe('ben');
  });

  it('preselects the only agent, never one of several, never an unlisted default', () => {
    expect(preselectedAgent(agents.slice(0, 1), null)?.slug).toBe('mira');
    expect(preselectedAgent(agents, null)).toBeUndefined();
    expect(preselectedAgent(agents, 'ghost')).toBeUndefined();
    expect(preselectedAgent([], 'mira')).toBeUndefined();
  });
});

describe('speakerView', () => {
  it('reads an agent speaker with its avatar', () => {
    expect(
      speakerView({ kind: 'agent', agentId: 'a1', slug: 'mira', displayName: 'Mira', avatarUrl: 'https://x.test/a.png', extra: 1 }),
    ).toEqual({ kind: 'agent', agentId: 'a1', slug: 'mira', displayName: 'Mira', avatarUrl: 'https://x.test/a.png' });
  });

  it('reads the system speaker', () => {
    expect(speakerView({ kind: 'system' })).toEqual({ kind: 'system' });
  });

  it('is null for absent, unknown or incomplete speakers — never invented', () => {
    expect(speakerView(undefined)).toBeNull();
    expect(speakerView({ kind: 'bot' })).toBeNull();
    expect(speakerView({ kind: 'agent', slug: 'mira', displayName: 'Mira' })).toBeNull();
    expect(speakerView({ kind: 'agent', agentId: 'a1', slug: 'mira', displayName: '  ' })).toBeNull();
  });
});

describe('systemNoticeView', () => {
  it('reads code, text and the named agent', () => {
    expect(
      systemNoticeView({ code: 'agent_not_available', text: 'Mira steht dir nicht zur Verfügung.', agent: { slug: 'mira', displayName: 'Mira' } }),
    ).toEqual({ code: 'agent_not_available', text: 'Mira steht dir nicht zur Verfügung.', agentName: 'Mira' });
  });

  it('renders an unknown code through its text', () => {
    expect(systemNoticeView({ code: 'future_code', text: 'hello' })).toEqual({ code: 'future_code', text: 'hello' });
  });

  it('is null without code or text', () => {
    expect(systemNoticeView({ text: 'x' })).toBeNull();
    expect(systemNoticeView({ code: 'x' })).toBeNull();
    expect(systemNoticeView(undefined)).toBeNull();
  });

  it('local notices have the same shape', () => {
    expect(localSystemNotice('no_agent', 'Wähle einen Agenten.')).toEqual({ code: 'no_agent', text: 'Wähle einen Agenten.' });
  });
});

describe('avatarSrc / initialsOf', () => {
  it('allows https, loopback http and server-relative paths', () => {
    expect(avatarSrc('https://cdn.test/a.png', undefined)).toBe('https://cdn.test/a.png');
    expect(avatarSrc('http://127.0.0.1:3979/a.png', undefined)).toBe('http://127.0.0.1:3979/a.png');
    expect(avatarSrc('/avatars/m.png', 'wss://omadia.test/canvas')).toBe('https://omadia.test/avatars/m.png');
  });

  it('drops everything else', () => {
    expect(avatarSrc('javascript:alert(1)', undefined)).toBeUndefined();
    expect(avatarSrc('http://evil.test/a.png', undefined)).toBeUndefined();
    expect(avatarSrc('//evil.test/a.png', 'wss://omadia.test')).toBeUndefined();
    expect(avatarSrc('/a.png', undefined)).toBeUndefined();
    expect(avatarSrc(undefined, 'wss://omadia.test')).toBeUndefined();
  });

  it('builds initials', () => {
    expect(initialsOf('Mira Schneider')).toBe('MS');
    expect(initialsOf('mira')).toBe('M');
    expect(initialsOf('  ')).toBe('?');
  });
});
