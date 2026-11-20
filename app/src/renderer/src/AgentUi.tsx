import { useState, type ReactElement } from 'react';
import type { AgentDirectoryEntry, Speaker } from '../../shared/protocol.js';
import { avatarSrc, initialsOf } from './store/speakerView.js';

/**
 * Agents in the UI (issue #52, spec 2042 §5.3, INV-1/4): every agent shows as
 * a name with an avatar, in the picker, in the pane bar of its canvas and on
 * every answer. Never a bare "omadia".
 */

interface AvatarProps {
  displayName: string;
  avatarUrl?: string | undefined;
  /** the connected server's ws(s) URL — resolves server-relative avatar paths */
  serverUrl?: string | undefined;
  size?: 'sm' | 'md';
}

/** The agent's picture, or its initials when it has none or it cannot load. */
export function AgentAvatar({ displayName, avatarUrl, serverUrl, size = 'md' }: AvatarProps): ReactElement {
  const src = avatarSrc(avatarUrl, serverUrl);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = src !== undefined && failedSrc !== src;
  return (
    <span className={`lume-agent-avatar lume-agent-avatar-${size}`} aria-hidden="true">
      {showImage ? (
        <img src={src} alt="" onError={() => setFailedSrc(src)} />
      ) : (
        <span className="lume-agent-avatar-initials">{initialsOf(displayName)}</span>
      )}
    </span>
  );
}

/** Avatar and name of one agent, inline. */
export function AgentBadge({
  displayName,
  avatarUrl,
  serverUrl,
  size = 'sm',
  title,
}: AvatarProps & { title?: string }): ReactElement {
  return (
    <span className="lume-agent-badge" {...(title ? { title } : {})}>
      <AgentAvatar displayName={displayName} avatarUrl={avatarUrl} serverUrl={serverUrl} size={size} />
      <span className="lume-agent-badge-name">{displayName}</span>
    </span>
  );
}

/**
 * Who an answer is from — shown with every answer on a canvas. The speaker is
 * the one the server stamped; a `system` speaker has no avatar and is shown by
 * the notice component instead.
 */
export function AnswerSpeaker({
  speaker,
  serverUrl,
}: {
  speaker: Speaker | null;
  serverUrl?: string | undefined;
}): ReactElement | null {
  if (speaker?.kind !== 'agent') return null;
  return (
    <div className="lume-answer-speaker" role="note" aria-label={`Antwort von ${speaker.displayName}`}>
      <AgentBadge displayName={speaker.displayName} avatarUrl={speaker.avatarUrl} serverUrl={serverUrl} />
    </div>
  );
}

interface PickerProps {
  agents: readonly AgentDirectoryEntry[];
  /** false until the server's directory arrived: "nobody" is not yet "loading" */
  loaded: boolean;
  selectedId: string | undefined;
  serverUrl?: string | undefined;
  onSelect: (agent: AgentDirectoryEntry) => void;
}

/**
 * The agent of a conversation, chosen before the first turn. Only the agents
 * the server lists for this user are offered (availability is the server's);
 * the choice is fixed for the canvas once its first turn is sent — for another
 * agent, open another canvas.
 */
export function AgentPicker({ agents, loaded, selectedId, serverUrl, onSelect }: PickerProps): ReactElement {
  if (!loaded) {
    return (
      <div className="lume-agent-picker" aria-busy="true">
        <p className="lume-agent-picker-hint">Agenten werden geladen …</p>
      </div>
    );
  }
  if (agents.length === 0) {
    return (
      <div className="lume-agent-picker">
        <p className="lume-agent-picker-hint" role="status">
          Dir steht hier noch kein Agent zur Verfügung. Bitte wende dich an die Administration.
        </p>
      </div>
    );
  }
  return (
    <div className="lume-agent-picker" role="radiogroup" aria-label="Agent für dieses Gespräch">
      <p className="lume-agent-picker-hint">Mit wem möchtest du sprechen?</p>
      <div className="lume-agent-picker-grid">
        {agents.map((agent) => {
          const selected = agent.id === selectedId;
          return (
            <button
              key={agent.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`lume-agent-card${selected ? ' lume-agent-card-selected' : ''}`}
              onClick={() => onSelect(agent)}
            >
              <AgentAvatar displayName={agent.displayName} avatarUrl={agent.avatarUrl} serverUrl={serverUrl} />
              <span className="lume-agent-card-text">
                <span className="lume-agent-card-name">{agent.displayName}</span>
                {agent.description !== undefined && (
                  <span className="lume-agent-card-desc">{agent.description}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
