import { BrowserWindow, app } from 'electron';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

/** Auth-flow trace into userData/auth-debug.log — the embedded login flow
 *  spans two processes and an external IdP; when it loops, this file is the
 *  only way to see WHICH hop dropped the session. Lean, append-only. */
export function authDebug(msg: string): void {
  try {
    appendFileSync(
      join(app.getPath('userData'), 'auth-debug.log'),
      `${new Date().toISOString()} ${msg}\n`,
    );
  } catch {
    /* logging must never break auth */
  }
}

/**
 * FALLBACK auth flow (issue #7): open the omadia web login in a window and
 * poll its partition for the `omadia_session` cookie the WebSocketRegistry
 * verifies pre-upgrade (PR-11: verifySession + Entra whitelist, 401/403
 * before the 101). Native credential login (authApi.ts) is the primary path;
 * this window remains for OIDC tenants and kernels without the discovery
 * endpoint. Works for both flows — we only need the cookie.
 */
export async function acquireSessionCookie(httpOrigin: string): Promise<string> {
  const win = new BrowserWindow({
    width: 480,
    height: 680,
    title: 'Sign in to Omadia',
    webPreferences: { partition: 'persist:omadia-auth', contextIsolation: true, nodeIntegration: false },
  });
  // Multi-instance reality: the persistent partition accumulates
  // omadia_session cookies from EVERY server ever signed into. An unscoped
  // poll finds a stale cookie from another origin instantly — the window
  // flashes shut and the wrong cookie is handed to the new server (login
  // loop). Scope everything to the origin this window actually loads; and
  // since this window only opens when the vaulted session is invalid, any
  // pre-existing cookie for that origin is stale by definition — drop it.
  const cookieScope = new URL(httpOrigin).origin;
  const ses = win.webContents.session;
  authDebug(`loginWindow open url=${httpOrigin} scope=${cookieScope}`);
  await ses.cookies.remove(cookieScope, 'omadia_session').catch(() => undefined);
  await win.loadURL(httpOrigin);

  return new Promise<string>((resolve, reject) => {
    let ticks = 0;
    const poll = setInterval(() => {
      ticks += 1;
      void ses.cookies
        .get({ url: cookieScope, name: 'omadia_session' })
        .then((cookies) => {
          if (ticks % 10 === 0) {
            authDebug(`loginWindow poll tick=${ticks} scoped=${cookies.length} page=${win.webContents.getURL().slice(0, 80)}`);
          }
          const c = cookies[0];
          if (c) {
            clearInterval(poll);
            authDebug(`loginWindow captured cookie for ${cookieScope} after ${ticks} ticks`);
            win.close();
            resolve(`omadia_session=${c.value}`);
          }
        })
        .catch((err) => authDebug(`loginWindow poll error: ${String(err)}`));
    }, 500);
    win.on('closed', () => {
      clearInterval(poll);
      reject(new Error('login window closed before a session was established'));
    });
  });
}
