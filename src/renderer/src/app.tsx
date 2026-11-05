import { type ReactElement, useCallback, useEffect, useState } from "react";

import type { AuthDiscovery, PairingDescriptor } from "../../shared/ipc";
import { ActionPanel } from "./components/action-panel";
import { AgentDot } from "./components/agent-dot";
import { CommandPalette } from "./components/command-palette";
import { LibraryView } from "./components/library-view";
import { Banners, BellPanel, Toasts } from "./components/notifications-view";
import { SettingsView, TurnLog } from "./components/settings-view";
import { hostOf, Sidebar } from "./components/sidebar";
import { WorkspaceView } from "./components/workspace-view";
import { useStore } from "./lib/create-store";
import { usePresence } from "./lib/use-presence";
import {
  ConnectScreen,
  SignInScreen,
  UnreachableScreen,
} from "./screens/onboarding";
import {
  abort,
  back,
  canvasStore,
  createCanvas,
  ensureConnected,
  handleServerMessage,
  handleStatus,
  onSocketStatus,
  refresh,
  resetCanvases,
} from "./state/canvases";
import { dismiss, notify } from "./state/notifications";
import {
  flushLocal,
  loadLocal,
  startPersistence,
  stopPersistence,
} from "./state/persistence";
import { loadSettings, saveSettings, sessionStore } from "./state/session";
import {
  activeDesktop,
  closeOverlay,
  closePane,
  createDesktop,
  leaves,
  openOverlay,
  resetWorkspace,
  showCanvas,
  splitPane,
  toggleSidebar,
  workspaceStore,
} from "./state/workspace";

const serverIdFor = (wsUrl: string): string => {
  let h = 0;
  for (const ch of wsUrl) h = (Math.imul(31, h) + ch.charCodeAt(0)) | 0;
  return `s${(h >>> 0).toString(36)}`;
};

/** Keep in step with the `closing` motion of `.palette` in app.css. */
const PALETTE_EXIT_MS = 130;

export function App(): ReactElement {
  const session = useStore(sessionStore, (s) => s);
  const [discovery, setDiscovery] = useState<AuthDiscovery | null>(null);
  const [connectError, setConnectError] = useState<string>();

  const enterWorkspace = useCallback((email?: string) => {
    const server = sessionStore.get().server;
    if (!server) return;
    resetCanvases();
    resetWorkspace();
    loadLocal(server.id);
    startPersistence();
    if (!activeDesktop()) {
      const first = canvasStore.get().order[0] ?? createCanvas();
      createDesktop("Desktop 1", first, true);
    } else if (leaves(activeDesktop()?.layout ?? null).length === 0) {
      showCanvas(canvasStore.get().order[0] ?? createCanvas());
    }
    sessionStore.set((s) => ({
      ...s,
      phase: "ready",
      ...(email ? { email } : {}),
    }));
  }, []);

  const checkServer = useCallback(async () => {
    const server = sessionStore.get().server;
    if (!server) {
      sessionStore.set((s) => ({ ...s, phase: "connect" }));
      return;
    }
    const info = await window.omadia
      .authSession(server.wsUrl)
      .then((i) => i)
      .catch(() => ({ valid: false, unknown: true }));
    if (info.valid) {
      enterWorkspace(
        "email" in info ? (info.email as string | undefined) : undefined,
      );
      return;
    }
    const providers = await window.omadia
      .authDiscover(server.wsUrl)
      .then((d) => d)
      .catch(() => null);
    if (providers === null && info.unknown) {
      sessionStore.set((s) => ({
        ...s,
        phase: "unreachable",
        unreachableSince: s.unreachableSince ?? Date.now(),
      }));
      return;
    }
    if (
      providers &&
      providers.providers.length === 0 &&
      !providers.setupRequired
    ) {
      // No auth configured: the socket accepts us as we are.
      enterWorkspace();
      return;
    }
    setDiscovery(providers);
    sessionStore.set((s) => ({
      ...s,
      phase: "sign-in",
      unreachableSince: undefined,
    }));
  }, [enterWorkspace]);

  // boot
  useEffect(() => {
    void loadSettings().then(() => checkServer());
    const offMsg = window.omadia.onServerMessage(handleServerMessage);
    const offStatus = window.omadia.onStatus(handleStatus);
    return () => {
      offMsg();
      offStatus();
      stopPersistence();
    };
  }, [checkServer]);

  // the session ended on the server: sign in again, keep the canvases
  useEffect(
    () =>
      onSocketStatus((_slot, next, prev) => {
        const host = sessionStore.get().server
          ? hostOf(sessionStore.get().server?.wsUrl ?? "")
          : "";
        if (next.state === "unauthenticated" || next.state === "forbidden") {
          flushLocal();
          void window.omadia.disconnectAll();
          void checkServer();
          return;
        }
        if (next.state === "connecting" && prev.state === "ready") {
          notify({
            id: "conn-lost",
            severity: "warning",
            title: `Verbindung zu ${host} unterbrochen`,
            body: "omadia verbindet neu.",
          });
        }
        if (next.state === "ready") dismiss("conn-lost");
      }),
    [checkServer],
  );

  // every pane on screen has a live socket
  const desktop = useStore(workspaceStore, (s) => activeDesktop(s));
  useEffect(() => {
    if (session.phase !== "ready") return;
    for (const k of leaves(desktop?.layout ?? null)) void ensureConnected(k);
  }, [desktop?.layout, session.phase]);

  const switchServer = useCallback(() => {
    flushLocal();
    stopPersistence();
    void window.omadia.disconnectAll();
    resetCanvases();
    resetWorkspace();
    setConnectError(undefined);
    sessionStore.set((s) => ({ ...s, phase: "connect" }));
  }, []);

  const signOut = useCallback(async () => {
    const server = sessionStore.get().server;
    flushLocal();
    stopPersistence();
    if (server)
      await window.omadia
        .authLogout(server.wsUrl)
        .then(() => undefined)
        .catch(() => undefined);
    resetCanvases();
    resetWorkspace();
    void checkServer();
  }, [checkServer]);

  const onPaired = useCallback(
    async (d: PairingDescriptor, input: string) => {
      const settings = sessionStore.get().settings;
      const id = serverIdFor(d.wsUrl);
      const entry = {
        id,
        name: d.name ?? hostOf(d.wsUrl) ?? input,
        wsUrl: d.wsUrl,
      };
      const servers = [
        ...(settings?.servers ?? []).filter((s) => s.id !== id),
        entry,
      ];
      await saveSettings({ servers, activeServerId: id });
      await checkServer();
    },
    [checkServer],
  );

  useAppCommands(session.phase === "ready");

  switch (session.phase) {
    case "booting":
      return <div className="arrival" />;
    case "connect":
      return (
        <ConnectScreen
          initial={session.server ? hostOf(session.server.wsUrl) : ""}
          {...(connectError ? { error: connectError } : {})}
          onPaired={(d, input) => void onPaired(d, input)}
          {...(session.server ? { onCancel: () => void checkServer() } : {})}
        />
      );
    case "sign-in":
      return (
        <SignInScreen
          host={hostOf(session.server?.wsUrl ?? "")}
          wsUrl={session.server?.wsUrl ?? ""}
          discovery={discovery}
          onSignedIn={(email) => enterWorkspace(email)}
          onBack={switchServer}
        />
      );
    case "unreachable":
      return (
        <UnreachableScreen
          host={hostOf(session.server?.wsUrl ?? "")}
          {...(session.unreachableSince
            ? { since: session.unreachableSince }
            : {})}
          onRetry={() => void checkServer()}
          onSwitch={switchServer}
        />
      );
    default:
      return (
        <Shell onSwitchServer={switchServer} onSignOut={() => void signOut()} />
      );
  }
}

function Shell({
  onSwitchServer,
  onSignOut,
}: {
  onSwitchServer(): void;
  onSignOut(): void;
}): ReactElement {
  const overlay = useStore(workspaceStore, (s) => s.overlay);
  const palette = usePresence(overlay.kind === "command", PALETTE_EXIT_MS);
  const sidebar = useStore(workspaceStore, (s) => s.sidebar);
  const devLog = useStore(sessionStore, (s) => s.settings?.devTurnLog ?? false);
  const platform = window.omadia.platform;
  return (
    <div
      className={`shell${sidebar ? "" : " no-sidebar"}${platform === "darwin" ? " mac" : ""}`}
    >
      <div className="drag-region" />
      {sidebar && platform === "darwin" ? (
        <div className="drag-region sidebar-drag" />
      ) : null}
      {sidebar ? <Sidebar /> : null}
      <div className="main-col">
        <Banners />
        <WorkspaceView />
      </div>
      <Toasts />
      {devLog ? <TurnLog /> : null}
      {palette.mounted ? <CommandPalette closing={palette.closing} /> : null}
      {overlay.kind === "library" ? <LibraryView /> : null}
      {overlay.kind === "settings" ? (
        <SettingsView onSwitchServer={onSwitchServer} onSignOut={onSignOut} />
      ) : null}
      {overlay.kind === "bell" ? <BellPanel /> : null}
      {overlay.kind === "action-panel" ? (
        <ActionPanel
          slotKey={overlay.slotKey}
          containerId={overlay.containerId}
          rowKey={overlay.rowKey}
          x={overlay.x}
          y={overlay.y}
        />
      ) : null}
      <AgentDot />
    </div>
  );
}

/** Native menu commands and the few shortcuts the menu cannot own. */
function useAppCommands(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const focused = (): string | undefined => activeDesktop()?.focused;
    const run = (command: string): void => {
      const slot = focused();
      if (command.startsWith("canvas.focus.")) {
        const n = Number(command.split(".").pop());
        const target = canvasStore.get().order[n - 1];
        if (target) showCanvas(target);
        return;
      }
      switch (command) {
        case "command.open":
          if (workspaceStore.get().overlay.kind === "command") closeOverlay();
          else openOverlay({ kind: "command" });
          break;
        case "canvas.new":
          showCanvas(createCanvas());
          break;
        case "desktop.new":
          createDesktop(undefined, createCanvas());
          break;
        case "library.open":
          openOverlay({ kind: "library" });
          break;
        case "canvas.close":
          if (slot) closePane(slot);
          break;
        case "pane.split-columns":
          if (slot) splitPane(slot, "columns", createCanvas());
          break;
        case "pane.split-rows":
          if (slot) splitPane(slot, "rows", createCanvas());
          break;
        case "mode.night":
        case "mode.day":
        case "mode.system":
          void saveSettings({
            mode: command.slice(5) as "night" | "day" | "system",
          });
          break;
        case "sidebar.toggle":
          toggleSidebar();
          break;
        case "canvas.back":
          if (slot) back(slot);
          break;
        case "canvas.refresh":
          if (slot) void refresh(slot);
          break;
        case "canvas.abort":
          if (slot) abort(slot);
          break;
        default:
          break;
      }
    };
    const offMenu = window.omadia.onMenuCommand(run);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && workspaceStore.get().overlay.kind !== "none") {
        closeOverlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      offMenu();
      window.removeEventListener("keydown", onKey);
    };
  }, [active]);
}
