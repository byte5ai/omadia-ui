import type { ReactElement } from 'react';
import type { SystemNoticeView } from './store/speakerView.js';

/**
 * A `system` notice (issue #52, spec 2042 INV-6/7): a message of the
 * management layer — a refused or failed turn, naming the agent it is about.
 * Set apart from every agent message: no avatar, no name of its own, its own
 * label and frame, so it can never be read as an agent speaking.
 */
export function SystemNotice({
  notice,
  onDismiss,
}: {
  notice: SystemNoticeView | null;
  onDismiss?: () => void;
}): ReactElement | null {
  if (notice === null) return null;
  return (
    <div className="lume-system-notice" role="alert" data-notice-code={notice.code}>
      <span className="lume-system-notice-label">Systemhinweis</span>
      <span className="lume-system-notice-text">{notice.text}</span>
      {onDismiss && (
        <button type="button" className="lume-system-notice-close" aria-label="Hinweis schließen" onClick={onDismiss}>
          ✕
        </button>
      )}
    </div>
  );
}
