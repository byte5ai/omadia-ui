import { BrowserWindow } from 'electron';

/**
 * Acquire the kernel session: open the omadia login page in a window and poll
 * its partition for the `omadia_session` cookie the WebSocketRegistry verifies
 * pre-upgrade (PR-11: verifySession + Entra whitelist, 401/403 before the 101).
 * Works for both local-credential and OIDC logins — we only need the cookie.
 */
export async function acquireSessionCookie(httpOrigin: string): Promise<string> {
  const win = new BrowserWindow({
    width: 480,
    height: 680,
    title: 'Sign in to Omadia',
    webPreferences: { partition: 'persist:omadia-auth', contextIsolation: true, nodeIntegration: false },
  });
  await win.loadURL(httpOrigin);

  return new Promise<string>((resolve, reject) => {
    const ses = win.webContents.session;
    const poll = setInterval(() => {
      void ses.cookies.get({ name: 'omadia_session' }).then((cookies) => {
        const c = cookies[0];
        if (c) {
          clearInterval(poll);
          win.close();
          resolve(`omadia_session=${c.value}`);
        }
      });
    }, 500);
    win.on('closed', () => {
      clearInterval(poll);
      reject(new Error('login window closed before a session was established'));
    });
  });
}
