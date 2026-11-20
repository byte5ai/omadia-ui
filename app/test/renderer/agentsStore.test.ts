import { describe, expect, it } from 'vitest';
import { applyServerMessage, initialCanvasState, startTurn } from '../../src/renderer/src/store/canvasStore.js';

const MIRA = { kind: 'agent', agentId: 'a1', slug: 'mira', displayName: 'Mira' } as const;

describe('agents on the canvas state', () => {
  it('"not loaded yet" is told from "nobody available"', () => {
    expect(initialCanvasState.agentsLoaded).toBe(false);
    const r = applyServerMessage(initialCanvasState, { type: 'agents', agents: [] });
    expect(r.state.agentsLoaded).toBe(true);
    expect(r.state.agents).toEqual([]);
  });

  it('stores the directory and its default agent', () => {
    const r = applyServerMessage(initialCanvasState, {
      type: 'agents',
      agents: [{ slug: 'mira', display_name: 'Mira' }],
      defaultAgent: { slug: 'mira' },
    });
    expect(r.state.agents).toEqual([{ id: 'mira', slug: 'mira', displayName: 'Mira' }]);
    expect(r.state.defaultAgent).toBe('mira');
  });

  it('a directory without default clears the previous default', () => {
    const a = applyServerMessage(initialCanvasState, { type: 'agents', agents: [], defaultAgent: { slug: 'x' } });
    const b = applyServerMessage(a.state, { type: 'agents', agents: [], defaultAgent: { slug: null, notice: 'no_agent' } });
    expect(b.state.defaultAgent).toBeNull();
  });
});

describe('speaker on the canvas state', () => {
  it('takes the speaker the server stamped on text and completion', () => {
    let r = applyServerMessage(initialCanvasState, { type: 'agent_text_delta', forTurn: 't', text: 'Hi', speaker: MIRA });
    expect(r.state.speaker).toEqual(MIRA);
    expect(r.state.prose).toBe('Hi');
    r = applyServerMessage(r.state, { type: 'turn_complete', forTurn: 't', speaker: { ...MIRA, displayName: 'Mira S.' } });
    expect(r.state.speaker).toMatchObject({ displayName: 'Mira S.' });
  });

  it('never invents a speaker for a server that sends none', () => {
    const r = applyServerMessage(initialCanvasState, { type: 'agent_text_delta', forTurn: 't', text: 'Hi' });
    expect(r.state.speaker).toBeNull();
  });

  it('a malformed speaker is ignored, the previous one stays', () => {
    const a = applyServerMessage(initialCanvasState, { type: 'turn_complete', forTurn: 't', speaker: MIRA });
    const b = applyServerMessage(a.state, { type: 'turn_complete', forTurn: 't2', speaker: { kind: 'agent' } as never });
    expect(b.state.speaker).toEqual(MIRA);
  });

  it('text from the system speaker becomes a set-apart notice, not agent prose', () => {
    let r = applyServerMessage(initialCanvasState, { type: 'agent_text_delta', forTurn: 't', text: 'Das ', speaker: { kind: 'system' } });
    r = applyServerMessage(r.state, { type: 'agent_text_delta', forTurn: 't', text: 'geht nicht.', speaker: { kind: 'system' } });
    expect(r.state.prose).toBe('');
    expect(r.state.systemNotice).toEqual({ code: 'system', text: 'Das geht nicht.' });
    expect(r.state.speaker).toBeNull();
  });

  it('the speaker of a surface event is stamped, not validated against the schema', () => {
    const tree = { type: 'container', id: 'root', children: [{ type: 'status', id: 's', text: 'hi' }] };
    const r = applyServerMessage(initialCanvasState, {
      type: 'surface_snapshot',
      canvasSessionId: 'c',
      surfaceSeq: 0,
      producesRevision: '0',
      tree,
      protocolVersion: '1.0',
      opsCatalogVersion: '1.0',
      speaker: MIRA,
    } as never);
    expect(r.state.revision).toBe('0');
    expect(r.state.speaker).toEqual(MIRA);
  });
});

describe('system notices on a failed turn', () => {
  const notice = {
    code: 'agent_not_available',
    text: 'Mira steht dir hier nicht zur Verfügung.',
    agent: { slug: 'mira', displayName: 'Mira' },
  };

  it('a refused turn shows the notice naming the agent, not the raw reason', () => {
    const r = applyServerMessage(initialCanvasState, {
      type: 'turn_error',
      forTurn: 't',
      message: 'agent_unavailable:mira',
      speaker: { kind: 'system' },
      code: 'agent_not_available',
      systemNotice: notice,
    });
    expect(r.state.systemNotice).toEqual({ code: 'agent_not_available', text: notice.text, agentName: 'Mira' });
    expect(r.state.turnError).toBe(notice.text);
    expect(r.state.turnPending).toBe(false);
  });

  it('an old server without a notice keeps the raw message and no notice', () => {
    const r = applyServerMessage(initialCanvasState, { type: 'turn_error', forTurn: 't', message: 'boom' });
    expect(r.state.systemNotice).toBeNull();
    expect(r.state.turnError).toBe('boom');
  });

  it('a new turn clears the notice, the prose and the error', () => {
    const failed = applyServerMessage(initialCanvasState, {
      type: 'turn_error',
      forTurn: 't',
      message: 'x',
      systemNotice: notice,
    }).state;
    const next = startTurn(failed);
    expect(next.systemNotice).toBeNull();
    expect(next.turnError).toBeNull();
    expect(next.turnPending).toBe(true);
  });
});
