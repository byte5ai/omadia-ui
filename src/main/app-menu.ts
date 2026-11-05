import { Menu, type MenuItemConstructorOptions } from "electron";

/** Static native menu. Every app command routes to the renderer by name. */
export function buildAppMenu(run: (command: string) => void): Menu {
  const item = (
    label: string,
    command: string,
    accelerator?: string,
  ): MenuItemConstructorOptions => ({
    label,
    click: () => run(command),
    ...(accelerator ? { accelerator } : {}),
  });

  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [{ role: "appMenu" } as MenuItemConstructorOptions]
      : []),
    {
      label: "Ablage",
      submenu: [
        item("Neuer Canvas", "canvas.new", "CmdOrCtrl+N"),
        item("Neuer Desktop", "desktop.new", "CmdOrCtrl+Shift+N"),
        { type: "separator" },
        item("Bibliothek", "library.open", "CmdOrCtrl+L"),
        { type: "separator" },
        item("Canvas schließen", "canvas.close", "CmdOrCtrl+W"),
      ],
    },
    { role: "editMenu" },
    {
      label: "Ansicht",
      submenu: [
        item("Befehl", "command.open", "CmdOrCtrl+K"),
        item("Spalte teilen", "pane.split-columns", "CmdOrCtrl+D"),
        item("Zeile teilen", "pane.split-rows", "CmdOrCtrl+Shift+D"),
        { type: "separator" },
        item("Nacht", "mode.night"),
        item("Tag", "mode.day"),
        item("Wie das System", "mode.system"),
        { type: "separator" },
        item("Seitenleiste", "sidebar.toggle", "CmdOrCtrl+\\"),
        { type: "separator" },
        { role: "togglefullscreen" },
        { role: "toggleDevTools" },
      ],
    },
    {
      label: "Canvas",
      submenu: [
        item("Zurück", "canvas.back", "CmdOrCtrl+["),
        item("Aktualisieren", "canvas.refresh", "CmdOrCtrl+R"),
        item("Abbrechen", "canvas.abort", "CmdOrCtrl+."),
        { type: "separator" },
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) =>
          item(`Canvas ${n}`, `canvas.focus.${n}`, `CmdOrCtrl+${n}`),
        ),
      ],
    },
    { role: "windowMenu" },
  ];
  return Menu.buildFromTemplate(template);
}
