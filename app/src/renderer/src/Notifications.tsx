import { useEffect, useState, type ReactNode } from 'react';
import {
  DEFAULT_TOAST_TTL_MS,
  isToast,
  unreadCount,
  type UiNotification,
} from './store/notificationStore.js';

interface Props {
  notifications: UiNotification[];
  onDismiss: (id: string) => void;
  onMarkAllRead: () => void;
  /** typed action → canvas turn (reuses the action plumbing) */
  onAction: (n: UiNotification) => void;
}

/** One toast with its own ttl timer — auto-dismiss is for transient
 *  info/success ONLY (errors/actionables never auto-dismiss, issue #15). */
function Toast({ n, onDismiss }: { n: UiNotification; onDismiss: (id: string) => void }): ReactNode {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(n.id), n.ttlMs ?? DEFAULT_TOAST_TTL_MS);
    return () => clearTimeout(t);
    // n.id alone: re-arming the timer on every parent re-render would make a
    // busy canvas keep toasts alive forever.
  }, [n.id]);  
  return (
    <div className={`lume-toast lume-notification-${n.severity}`} role="status">
      <span className="lume-notification-title">{n.title}</span>
      {n.body && <span className="lume-notification-body">{n.body}</span>}
      <button type="button" className="lume-notification-close" onClick={() => onDismiss(n.id)}>
        ×
      </button>
    </div>
  );
}

/** Notifications surface (issue #15): toast stack (transient info/success),
 *  banner area (warning/error, persist until dismissed, carry the action),
 *  and the bell with the persisted history. Out-of-band from the canvas —
 *  never inside the surface tree. */
export function Notifications({ notifications, onDismiss, onMarkAllRead, onAction }: Props): ReactNode {
  const [showCenter, setShowCenter] = useState(false);
  const toasts = notifications.filter((n) => !n.dismissed && isToast(n)).slice(0, 3);
  const banners = notifications.filter((n) => !n.dismissed && !isToast(n)).slice(0, 2);
  const unread = unreadCount(notifications);

  return (
    <>
      {banners.length > 0 && (
        <div className="lume-banner-stack">
          {banners.map((n) => (
            <div key={n.id} className={`lume-banner lume-notification-${n.severity}`} role="alert">
              <div className="lume-banner-text">
                <span className="lume-notification-title">{n.title}</span>
                {n.body && <span className="lume-notification-body">{n.body}</span>}
                {n.source && <span className="lume-notification-source">{n.source}</span>}
              </div>
              {n.action && (
                <button type="button" className="lume-button" onClick={() => onAction(n)}>
                  {n.action.label ?? 'Öffnen'}
                </button>
              )}
              <button type="button" className="lume-notification-close" onClick={() => onDismiss(n.id)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="lume-toast-stack">
        {toasts.map((n) => (
          <Toast key={n.id} n={n} onDismiss={onDismiss} />
        ))}
      </div>
      <button
        type="button"
        className="lume-bell"
        title="Benachrichtigungen"
        onClick={() => {
          setShowCenter((v) => !v);
          if (!showCenter) onMarkAllRead();
        }}
      >
        ◷
        {unread > 0 && <span className="lume-bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {showCenter && (
        <div className="lume-notification-center" onClick={(e) => e.stopPropagation()}>
          <div className="lume-notification-center-title">Benachrichtigungen</div>
          {notifications.length === 0 && (
            <div className="lume-notification-empty">Keine Benachrichtigungen.</div>
          )}
          {notifications.slice(0, 30).map((n) => (
            <div key={n.id} className={`lume-notification-item lume-notification-${n.severity}`}>
              <span className="lume-notification-title">{n.title}</span>
              {n.body && <span className="lume-notification-body">{n.body}</span>}
              <span className="lume-notification-source">
                {n.source ?? ''} · {new Date(n.receivedAt).toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
