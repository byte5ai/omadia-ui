import { describe, expect, it } from "vitest";

import { classifyPrompt } from "../src/renderer/src/lib/light-world";

describe("light world of a request", () => {
  it.each([
    "Zeig mir den Jahresumsatz aus Odoo",
    "Wie entwickeln sich unsere Kosten im dritten Quartal?",
    "Welche Freigaben warten auf mich?",
    "Sollen wir den Vertrag mit Müller verlängern?",
    "Team-Auslastung und Budget für Q4",
    "Risiken im DSGVO-Audit",
    "Compare revenue and margin by region",
  ])("decides: %s", (prompt) => {
    expect(classifyPrompt(prompt)).toBe("decision");
  });

  it.each([
    "Zeig mir die Fehler-Logs vom Server",
    "Welche Pull Requests sind offen im Repo?",
    "Status der Deploys in der CI",
    "Liste alle API-Endpoints mit Latenz",
    "Show the stack trace of the last exception",
    "Welche MCP-Plugins sind installiert?",
  ])("builds: %s", (prompt) => {
    expect(classifyPrompt(prompt)).toBe("developer");
  });

  it.each([
    "Wie wird das Wetter morgen in Köln?",
    "Erstelle mir eine Einkaufsliste",
    "Neuer Canvas",
    "Fasse den Artikel zusammen",
    "Ein ideales Rezept, kostenlos",
    "Öffne meine Einstellungen",
    "",
  ])("stays in the default light: %s", (prompt) => {
    expect(classifyPrompt(prompt)).toBe("default");
  });

  it("does not take words hidden in others for developer words", () => {
    expect(classifyPrompt("Kapital und Katalog")).not.toBe("developer");
  });
});
