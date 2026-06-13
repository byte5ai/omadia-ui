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

/** OIDC reality: a `…/login/<provider>/start` endpoint sets the PKCE
 *  pending-state cookie on the host it is SERVED from, then redirects to the
 *  IdP carrying a `redirect_uri`. After the IdP, the browser lands on THAT
 *  callback host — which validates the pending-state cookie. When the canvas
 *  server origin and the callback host differ (a kernel reached through a
 *  proxy prefix, e.g. the harness `/bot-api/*` → middleware), running start
 *  on the canvas origin sets the cookie on the wrong host → the callback
 *  fails with "missing pending-state cookie". So probe the start 302 once,
 *  read the real callback origin from `redirect_uri`, and run the WHOLE flow
 *  there (start, pending-state cookie, callback, omadia_session colocate).
 *
 *  Returns the URL to load + the URL to poll cookies against (carries the
 *  proxy path prefix so a Path=/bot-api cookie matches). Non-OIDC URLs (a
 *  plain `/login` page, kernels without discovery) fall through unchanged. */
async function resolveLoginUrls(startUrl: string): Promise<{ loadUrl: string; cookieUrl: string }> {
  const passthrough = { loadUrl: startUrl, cookieUrl: new URL(startUrl).origin };
  if (!/\/login\/[^/]+\/start\/?$/.test(new URL(startUrl).pathname)) return passthrough;
  try {
    const res = await fetch(startUrl, { redirect: 'manual' });
    const location = res.headers.get('location');
    if (location === null) return passthrough;
    const redirectUri = new URL(location).searchParams.get('redirect_uri');
    if (redirectUri === null) return passthrough;
    // callback = <authBase>/callback → authBase carries the proxy prefix.
    const authBase = redirectUri.replace(/\/callback\/?$/, '');
    const startPath = new URL(startUrl).pathname; // …/login/<provider>/start
    const tail = startPath.slice(startPath.indexOf('/login/'));
    const loadUrl = `${authBase}${tail}`;
    authDebug(`resolveLoginUrls: start=${startUrl} → callback origin ${new URL(authBase).origin}, load=${loadUrl}`);
    return { loadUrl, cookieUrl: authBase };
  } catch (err) {
    authDebug(`resolveLoginUrls probe failed (${String(err)}) — using ${startUrl} as-is`);
    return passthrough;
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
  const { loadUrl, cookieUrl } = await resolveLoginUrls(httpOrigin);
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
  // loop). Scope everything to the host the flow actually runs on; and since
  // this window only opens when the vaulted session is invalid, any
  // pre-existing cookie for that host is stale by definition — drop it.
  // cookieUrl carries the path prefix so a Path=/<prefix> cookie matches.
  const cookieOrigin = new URL(cookieUrl).origin;
  const ses = win.webContents.session;
  authDebug(`loginWindow open load=${loadUrl} cookieUrl=${cookieUrl}`);
  await ses.cookies.remove(cookieOrigin, 'omadia_session').catch(() => undefined);
  await win.loadURL(loadUrl);

  return new Promise<string>((resolve, reject) => {
    let ticks = 0;
    const poll = setInterval(() => {
      ticks += 1;
      void ses.cookies
        .get({ url: cookieUrl, name: 'omadia_session' })
        .then((cookies) => {
          if (ticks % 10 === 0) {
            authDebug(`loginWindow poll tick=${ticks} scoped=${cookies.length} page=${win.webContents.getURL().slice(0, 80)}`);
          }
          const c = cookies[0];
          if (c) {
            clearInterval(poll);
            authDebug(`loginWindow captured cookie for ${cookieUrl} after ${ticks} ticks`);
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
