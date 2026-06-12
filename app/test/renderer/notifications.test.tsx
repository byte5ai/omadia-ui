import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Notifications } from '../../src/renderer/src/Notifications.js';
import {
  addNotification,
  dismissNotification,
  isToast,
  unreadCount,
  type UiNotification,
} from '../../src/renderer/src/store/notificationStore.js';

const msg = (over: Partial<UiNotification> = {}) => ({
  type: 'notification' as const,
  id: over.id ?? 'n-1',
  severity: over.severity ?? ('info' as const),
  title: over.title ?? 'Report fertig',
  ...over,
});

describe('notificationStore', () => {
  it('prepends, dedupes by dedupeKey (undismissed replaced), caps unread', () => {
    let list: UiNotification[] = [];
    list = addNotification(list, msg({ id: 'a', dedupeKey: 'job:report' }), 's1', 1000);
    list = addNotification(list, msg({ id: 'b', dedupeKey: 'job:report', title: 'Neuer Stand' }), 's1', 2000);
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe('b');
    expect(unreadCount(list)).toBe(1);

    // a dismissed older one is NOT resurrected/replaced
    list = dismissNotification(list, 'b');
    list = addNotification(list, msg({ id: 'c', dedupeKey: 'job:report' }), 's1', 3000);
    expect(list).toHaveLength(2);
    expect(unreadCount(list)).toBe(1);

    // exact id replay is ignored
    expect(addNotification(list, msg({ id: 'c', dedupeKey: 'job:report' }), 's1', 4000)).toBe(list);
  });

  it('maps severity to element class: info/success toast, warning/error banner', () => {
    expect(isToast(addNotification([], msg({ severity: 'success' }), 's1', 1)[0] as UiNotification)).toBe(true);
    expect(isToast(addNotification([], msg({ severity: 'error' }), 's1', 1)[0] as UiNotification)).toBe(false);
  });
});

describe('Notifications component', () => {
  it('renders toasts for info and banners (with action + alert role) for errors', () => {
    let list: UiNotification[] = [];
    list = addNotification(list, msg({ id: 't1', severity: 'info', title: 'Gespeichert' }), 's1', 1);
    list = addNotification(
      list,
      msg({
        id: 'e1',
        severity: 'error',
        title: 'Job fehlgeschlagen',
        action: { type: 'retry_job', label: 'Erneut versuchen' },
      }),
      's1',
      2,
    );
    const html = renderToStaticMarkup(
      <Notifications notifications={list} onDismiss={() => {}} onMarkAllRead={() => {}} onAction={() => {}} />,
    );
    expect(html).toContain('lume-toast');
    expect(html).toContain('Gespeichert');
    expect(html).toContain('lume-banner');
    expect(html).toContain('role="alert"');
    expect(html).toContain('Erneut versuchen');
    expect(html).toContain('lume-bell');
    expect(html).toContain('lume-bell-badge');
  });
});
