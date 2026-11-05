import gallery from "../../../../node_modules/@omadia/canvas-core/fixtures/_gallery.json";

/**
 * Local trees for the dev mode: the canonical primitive gallery from
 * canvas-core and the team-utilisation screen from the design. Both are
 * validated like server trees before they render.
 */

export const galleryTree: unknown = gallery;

const people: Array<[string, string, number, number, string, string]> = [
  ["anna", "Anna Schmidt", 5, 6.5, "–", "Unter Budget"],
  ["bernd", "Bernd Lutz", 8, 7, "ab Donnerstag", "Unter Budget"],
  ["cara", "Cara König", 3, 4, "–", "Unter Budget"],
  ["deniz", "Deniz Yıldız", 4, 22, "–", "Im Plan"],
  ["erik", "Erik Brandt", 6, 31, "–", "Im Plan"],
  ["funda", "Funda Acar", 2, 18, "nächste Woche", "Im Plan"],
];

const target = { kind: "container", containerId: "auslastung" };

export const utilisationTree: unknown = {
  type: "container",
  id: "root",
  layout: "stack",
  children: [
    {
      type: "toolbar",
      id: "menu",
      children: [
        {
          type: "button",
          id: "m-view",
          label: "Ansicht",
          action: { type: "view_menu" },
        },
        {
          type: "button",
          id: "m-filter",
          label: "Filtern",
          action: { type: "filter_menu" },
        },
        {
          type: "button",
          id: "m-export",
          label: "Exportieren",
          action: { type: "export" },
        },
      ],
    },
    {
      type: "heading",
      id: "title",
      content: "Team-Auslastung, KW 41",
      level: 1,
    },
    {
      type: "container",
      id: "meta",
      layout: "flow",
      children: [
        {
          type: "text",
          id: "sources",
          content: "Aus Jira, ERP und HR zusammengeführt",
          style: ["compact"],
        },
        {
          type: "status",
          id: "verified",
          text: "Verifiziert",
          tone: "success",
        },
      ],
    },
    {
      type: "table",
      id: "auslastung",
      selectable: "single",
      columns: [
        { fieldKey: "person", label: "Person" },
        { fieldKey: "tickets", label: "Offene Tickets", type: "number" },
        { fieldKey: "budget", label: "Restbudget (h)", type: "number" },
        { fieldKey: "urlaub", label: "Urlaub" },
        { fieldKey: "status", label: "Status" },
      ],
      rows: people.map(([rowKey, person, tickets, budget, urlaub, status]) => ({
        rowKey,
        cells: { person, tickets, budget, urlaub, status },
      })),
      suggestedActions: [
        {
          id: "s1",
          label: "Umverteilung vorschlagen",
          effect: "internal",
          target,
          prompt: "Schlag eine Umverteilung von Bernds Tickets vor",
        },
        {
          id: "s2",
          label: "Urlaubsvertretung vorschlagen",
          effect: "internal",
          target,
          prompt: "Schlag eine Urlaubsvertretung für Bernd vor",
        },
      ],
    },
    {
      type: "container",
      id: "charts",
      layout: "split",
      children: [
        {
          type: "container",
          id: "c-budget",
          title: "Restbudget nach Abteilung",
          children: [
            {
              type: "chart",
              id: "budget-chart",
              chartType: "bar",
              points: [
                { pointKey: "vertrieb", label: "Vertrieb", value: 82 },
                { pointKey: "marketing", label: "Marketing", value: 64 },
                { pointKey: "technik", label: "Technik", value: 48 },
                { pointKey: "service", label: "Service", value: 35 },
              ],
            },
          ],
        },
        {
          type: "container",
          id: "c-costs",
          title: "Kostenanteile",
          children: [
            {
              type: "chart",
              id: "cost-chart",
              chartType: "pie",
              points: [
                { pointKey: "personal", label: "Personal", value: 34 },
                { pointKey: "lizenzen", label: "Lizenzen", value: 22 },
                { pointKey: "reisen", label: "Reisen", value: 16 },
                { pointKey: "hardware", label: "Hardware", value: 12 },
                { pointKey: "schulung", label: "Schulung", value: 9 },
                { pointKey: "sonstiges", label: "Sonstiges", value: 7 },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export const utilisationProse =
  "Drei Personen liegen unter Budget: Anna, Bernd und Cara. Bernd ist ab Donnerstag im Urlaub. Soll ich seine Tickets umverteilen?";

/** What "Wie sehen unsere jährlichen Umsatzzahlen aus?" becomes once an
 *  Odoo Accounting agent publishes into the skeleton. Example values only. */
const revenue: Array<[string, number, number]> = [
  ["2021", 1_840_000, 1_212],
  ["2022", 2_210_000, 1_398],
  ["2023", 2_460_000, 1_517],
  ["2024", 2_930_000, 1_702],
  ["2025", 3_380_000, 1_896],
  ["2026", 2_870_000, 1_588],
];

const eur = (n: number): string =>
  `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n)} €`;

const revenueTarget = { kind: "container", containerId: "umsatz-jahre" };

export const revenueTree: unknown = {
  type: "container",
  id: "root",
  layout: "stack",
  children: [
    {
      type: "toolbar",
      id: "menu",
      children: [
        {
          type: "button",
          id: "m-view",
          label: "Ansicht",
          action: { type: "view_menu" },
        },
        {
          type: "button",
          id: "m-export",
          label: "Exportieren",
          action: { type: "export" },
        },
      ],
    },
    {
      type: "heading",
      id: "title",
      content: "Jahresumsatz 2021 bis 2026",
      level: 1,
    },
    {
      type: "container",
      id: "meta",
      layout: "flow",
      children: [
        {
          type: "text",
          id: "source",
          content: "Aus Odoo Accounting, gebuchte Ausgangsrechnungen",
          style: ["compact"],
        },
        {
          type: "status",
          id: "verified",
          text: "Verifiziert",
          tone: "success",
        },
        {
          type: "status",
          id: "example",
          text: "Beispielwerte",
          tone: "neutral",
        },
      ],
    },
    {
      type: "container",
      id: "kpis",
      layout: "grid",
      children: [
        {
          type: "container",
          id: "kpi-2025",
          title: "Umsatz 2025",
          children: [
            {
              type: "heading",
              id: "kpi-2025.value",
              content: eur(3_380_000),
              level: 2,
            },
          ],
        },
        {
          type: "container",
          id: "kpi-growth",
          title: "Wachstum gegenüber 2024",
          children: [
            {
              type: "heading",
              id: "kpi-growth.value",
              content: "+15,4 %",
              level: 2,
            },
            {
              type: "status",
              id: "kpi-growth.state",
              text: "über Plan",
              tone: "success",
            },
          ],
        },
        {
          type: "container",
          id: "kpi-ytd",
          title: "2026 bis heute",
          children: [
            {
              type: "chart",
              id: "ytd-spark",
              chartType: "line",
              variant: "spark",
              points: [
                { pointKey: "q1", label: "Q1", value: 760_000 },
                { pointKey: "q2", label: "Q2", value: 1_590_000 },
                { pointKey: "q3", label: "Q3", value: 2_440_000 },
                { pointKey: "okt", label: "bis Oktober", value: 2_870_000 },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "container",
      id: "c-chart",
      title: "Umsatz pro Jahr",
      children: [
        {
          type: "chart",
          id: "umsatz-chart",
          chartType: "bar",
          points: revenue.map(([year, value]) => ({
            pointKey: year,
            label: year,
            value,
          })),
        },
      ],
    },
    {
      type: "table",
      id: "umsatz-jahre",
      selectable: "single",
      columns: [
        { fieldKey: "jahr", label: "Jahr" },
        { fieldKey: "umsatz", label: "Umsatz (€)", type: "number" },
        { fieldKey: "delta", label: "Vorjahr" },
        { fieldKey: "rechnungen", label: "Rechnungen", type: "number" },
        { fieldKey: "status", label: "Status" },
      ],
      rows: revenue.map(([year, value, invoices], i) => {
        const prev = revenue[i - 1]?.[1];
        return {
          rowKey: year,
          cells: {
            jahr: year,
            umsatz: value,
            delta: prev
              ? `${value >= prev ? "+" : ""}${(((value - prev) / prev) * 100).toFixed(1).replace(".", ",")} %`
              : "–",
            rechnungen: invoices,
            status: year === "2026" ? "Offen, Jahr läuft" : "Abgeschlossen",
          },
        };
      }),
      suggestedActions: [
        {
          id: "r1",
          label: "Nach Kunden aufschlüsseln",
          effect: "internal",
          target: revenueTarget,
          prompt: "Schlüssel den Jahresumsatz nach Kunden auf",
        },
        {
          id: "r2",
          label: "Nach Monaten aufschlüsseln",
          effect: "internal",
          target: revenueTarget,
          prompt: "Zeig den Umsatz 2026 nach Monaten",
        },
      ],
    },
  ],
};
