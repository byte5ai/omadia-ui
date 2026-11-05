import { BrowserWindow, shell } from "electron";

import { SESSION_COOKIE, type StoredCookie } from "./auth-api";

/**
 * OIDC sign-in: the provider's start endpoint sets a pending-state cookie on
 * the host that serves it and redirects with a redirect_uri. When the canvas
 * origin sits behind a proxy prefix the callback host differs, so we probe
 * the start redirect once and run the whole flow on the callback origin.
 */
async function resolveLoginUrls(
  startUrl: string,
): Promise<{ loadUrl: string; cookieUrl: string }> {
  const passthrough = {
    loadUrl: startUrl,
    cookieUrl: new URL(startUrl).origin,
  };
  if (!/\/login\/[^/]+\/start\/?$/.test(new URL(startUrl).pathname)) {
    return passthrough;
  }
  return await fetch(startUrl, { redirect: "manual" })
    .then((res) => {
      const location = res.headers.get("location");
      const redirectUri = location
        ? new URL(location).searchParams.get("redirect_uri")
        : null;
      if (!redirectUri) return passthrough;
      const authBase = redirectUri.replace(/\/callback\/?$/, "");
      const startPath = new URL(startUrl).pathname;
      const tail = startPath.slice(startPath.indexOf("/login/"));
      return { loadUrl: `${authBase}${tail}`, cookieUrl: authBase };
    })
    .catch(() => passthrough);
}

let active: BrowserWindow | null = null;

export function cancelBrowserLogin(): void {
  active?.close();
}

/**
 * Opens the sign-in page in a window of its own partition and resolves with
 * the session cookie as soon as the server sets it.
 */
export async function acquireSessionCookie(
  startUrl: string,
  parent: BrowserWindow | null,
): Promise<StoredCookie> {
  const { loadUrl, cookieUrl } = await resolveLoginUrls(startUrl);
  active?.close();
  const win = new BrowserWindow({
    width: 480,
    height: 680,
    title: "Bei omadia anmelden",
    ...(parent ? { parent } : {}),
    webPreferences: {
      partition: "persist:omadia-auth",
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  active = win;
  // External links (help, password reset) belong in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  const ses = win.webContents.session;
  // Any cookie for this host from before is stale: the window only opens
  // when the vaulted session no longer verifies.
  await ses.cookies
    .remove(new URL(cookieUrl).origin, SESSION_COOKIE)
    .then(() => undefined)
    .catch(() => undefined);
  void win.loadURL(loadUrl);

  return await new Promise<StoredCookie>((resolve, reject) => {
    const poll = setInterval(() => {
      void ses.cookies
        .get({ url: cookieUrl, name: SESSION_COOKIE })
        .then((cookies) => {
          const c = cookies[0];
          if (!c) return;
          clearInterval(poll);
          resolve({
            cookie: `${SESSION_COOKIE}=${c.value}`,
            ...(c.expirationDate
              ? { expiresAt: Math.floor(c.expirationDate) }
              : {}),
          });
          win.close();
        })
        .catch(() => undefined);
    }, 500);
    win.on("closed", () => {
      clearInterval(poll);
      if (active === win) active = null;
      reject(new Error("cancelled"));
    });
  });
}
