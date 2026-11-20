import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AgentBadge, AgentPicker, AnswerSpeaker } from '../../src/renderer/src/AgentUi.js';
import { SystemNotice } from '../../src/renderer/src/SystemNotice.js';

const AGENTS = [
  { id: 'mira', slug: 'mira', displayName: 'Mira Schneider', description: 'Vertrieb' },
  { id: 'ben', slug: 'ben', displayName: 'Ben', avatarUrl: 'https://cdn.test/ben.png' },
];

describe('AgentPicker', () => {
  it('lists every available agent with name and avatar, marks the selection', () => {
    const html = renderToStaticMarkup(
      <AgentPicker agents={AGENTS} loaded selectedId="ben" onSelect={() => {}} />,
    );
    expect(html).toContain('Mira Schneider');
    expect(html).toContain('Vertrieb');
    expect(html).toContain('>MS<');
    expect(html).toContain('src="https://cdn.test/ben.png"');
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toContain('lume-agent-card-selected');
  });

  it('says it is loading, not that nobody is available, before the directory arrived', () => {
    const html = renderToStaticMarkup(<AgentPicker agents={[]} loaded={false} selectedId={undefined} onSelect={() => {}} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('kein Agent');
  });

  it('says nobody is available when the directory is empty', () => {
    const html = renderToStaticMarkup(<AgentPicker agents={[]} loaded selectedId={undefined} onSelect={() => {}} />);
    expect(html).toContain('kein Agent');
  });

  it('never shows the term orchestrator', () => {
    const html = renderToStaticMarkup(<AgentPicker agents={AGENTS} loaded selectedId={undefined} onSelect={() => {}} />);
    expect(html.toLowerCase()).not.toContain('orchestrator');
  });
});

describe('AnswerSpeaker / AgentBadge', () => {
  it('shows the agent an answer is from', () => {
    const html = renderToStaticMarkup(
      <AnswerSpeaker speaker={{ kind: 'agent', agentId: 'a', slug: 'mira', displayName: 'Mira' }} />,
    );
    expect(html).toContain('Mira');
    expect(html).toContain('Antwort von Mira');
  });

  it('shows nothing for a system speaker or no speaker', () => {
    expect(renderToStaticMarkup(<AnswerSpeaker speaker={{ kind: 'system' }} />)).toBe('');
    expect(renderToStaticMarkup(<AnswerSpeaker speaker={null} />)).toBe('');
  });

  it('falls back to initials for a refused avatar URL', () => {
    const html = renderToStaticMarkup(<AgentBadge displayName="Mira Schneider" avatarUrl="javascript:alert(1)" />);
    expect(html).not.toContain('<img');
    expect(html).toContain('>MS<');
  });
});

describe('SystemNotice', () => {
  it('is set apart: own label, no avatar, no agent name of its own', () => {
    const html = renderToStaticMarkup(
      <SystemNotice notice={{ code: 'agent_not_available', text: 'Mira steht dir nicht zur Verfügung.', agentName: 'Mira' }} />,
    );
    expect(html).toContain('lume-system-notice');
    expect(html).toContain('Systemhinweis');
    expect(html).toContain('Mira steht dir nicht zur Verfügung.');
    expect(html).toContain('data-notice-code="agent_not_available"');
    expect(html).not.toContain('lume-agent-avatar');
  });

  it('renders nothing without a notice and only offers dismissal when asked', () => {
    expect(renderToStaticMarkup(<SystemNotice notice={null} />)).toBe('');
    const notice = { code: 'x', text: 'y' };
    expect(renderToStaticMarkup(<SystemNotice notice={notice} />)).not.toContain('<button');
    expect(renderToStaticMarkup(<SystemNotice notice={notice} onDismiss={() => {}} />)).toContain('<button');
  });
});
