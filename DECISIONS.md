# Entscheidungen

Annahmen und Festlegungen, die über `PLAN.md` hinausgehen oder Unklarheiten auflösen.

## Phase 1 – Scaffold und Billing-Kern

### Toolchain
- **SPFx 1.24.1** mit Heft-Toolchain (kein gulp), React 18.3, TypeScript 5.8, Node 22 (`.nvmrc`).
- **Jest statt Vitest.** Die Heft-Toolchain bringt Jest bereits mit und führt die Tests bei jedem Build aus (`npm test` = `heft test --clean`). Die Testdateien liegen unter `src/billing/__tests__/*.test.ts`.
- Ship-Build und `.sppkg`: `npm run build` (`heft test --clean --production && heft package-solution --production`). Das Paket liegt danach unter `sharepoint/solution/`.
- Die Lint-Regel `@rushstack/no-new-null` ist deaktiviert. SharePoint liefert leere Felder als `null`, und `null` steht im Modell bewusst für „nicht gesetzt“.

### Datum
- Intern ist jedes Datum ein String im Format `YYYY-MM-DD`. Gerechnet wird mit date-fns über lokale Date-Objekte um Mitternacht. Strings lassen sich direkt vergleichen.
- Bei der Monatsaddition wird das Monatsende begrenzt, wie in date-fns: 31.01. + 1 Monat ergibt 28.02. bzw. 29.02.

### Monate
- **Volle Monate** werden an einem Monatsraster gezählt, das bei `Von` beginnt. Im Modus `Laufzeit` ist der Anker des Rasters der `Beginn` der Position.
- **Resttage** werden durch die Länge des angebrochenen Rastermonats geteilt. Liegt das Raster auf dem 1. eines Monats, ist das genau „Resttage / Tage des Kalendermonats“.
- Gerundet wird kaufmännisch auf 2 Dezimalstellen. Intern werden die Monate als Integer `monateX100` geführt.
- Dadurch ergibt ein voller Laufzeitzeitraum immer genau `LaufzeitMonate`, auch über den Februar eines Schaltjahres. Beispiel: 15.02.2027–14.02.2028 ergibt 12,00.

### Raster im Modus Laufzeit
- Die Segmentgrenzen werden immer vom `Beginn` aus berechnet: `Beginn + k × Laufzeit`. So verschiebt sich das Ende bei Monatsenden nicht von Periode zu Periode. Beispiel ab 31.01. mit 1 Monat: 31.01.–27.02., 28.02.–30.03., 31.03.–29.04.
- Liegt `nextStart` nicht auf diesem Raster, etwa nach einer manuellen Änderung, wird ab `nextStart` neu gerastert.

### Art im Modus Stichtag
- Ein Vorsegment (`nextStart < J`) bekommt die Art **Nachverrechnung**, wenn `nextStart < J − 12 Monate`. Sonst ist es **Anteilig**.
- Bei einer Lücke über mehrere Jahre entsteht **ein** Nachverrechnungssegment, nicht eines pro Jahr.

### Hinweistexte im Vorschlag (aus dem Mockup)
| Art | Modus | Hinweis |
|---|---|---|
| Folgezeitraum | Stichtag | Folgezeitraum |
| Folgezeitraum | Laufzeit | Verlängerung im Voraus |
| Anteilig (Vorsegment vor J) | Stichtag | anteilig nachverrechnet (blaues Badge) |
| Anteilig (im Abrechnungsjahr) | Stichtag | anteilig |
| Nachverrechnung | beide | Nachverrechnung |
| Einmalig | – | einmalig |

### Standard-Stichtag („Verrechnen bis“)
- Der Vorschlag ist das Ende des Abrechnungsjahres, dessen Beginn (der 1. des `StichtagMonat`) dem Rechnungsdatum am nächsten liegt.
- Beispiel: Rechnung vom 08.01.2027 oder vom 11.11.2026 ergibt jeweils den 31.12.2027.

### Geld
- Alle Beträge werden in Cent als Integer geführt. Gerundet wird kaufmännisch, halbe Cent vom Nullpunkt weg.
- **Einzelpreis** ist der Preis der Position je Stück, je Monat oder je Laufzeit, also zum Beispiel 12,50 € bei M365 × 5. Die Menge steht als eigene Spalte daneben. Das weicht vom Mockup ab, das dort 62,50 € zeigt.
- Formatiert wird mit einer eigenen Funktion als `1.130,76 €`. `Intl` mit `de-AT` liefert je nach Browser `€ 1.130,76` oder ein geschütztes Leerzeichen als Tausendertrenner.
- Die USt wird auf die Nettosumme gerechnet, mit dem Satz aus dem Property Pane.

### Prüfungen
- Die Rechnungsnummer wird ohne Rücksicht auf Groß- und Kleinschreibung und ohne Leerzeichen am Rand auf Eindeutigkeit geprüft.
- Hat eine Rechnung mehrere Segmente derselben Position, muss jedes Segment an das vorherige anschließen. Überschneiden sich zwei Segmente in derselben Rechnung, ist das ein Fehler.
- Einmalige Positionen dürfen ohne Zeitraum sein. Ist ein Zeitraum angegeben, muss `Bis ≥ Von` gelten.
- Beim Bearbeiten eines Entwurfs werden dessen eigene Rechnungspositionen und seine Nummer nicht in die Prüfung einbezogen. Dafür sorgt der Aufrufer.

### Nummernvorschläge
- `RE-{YYYY}-{NNN}` und `K-{NNNN}`: Der Vorschlag ist die höchste vorhandene Nummer mit gleichem Präfix (bei Rechnungen gleiches Jahr) plus 1.
- Für Kundennummern beginnt die Zählung bei 1 (`K-0001`).

## Vorgaben von dir (2026-11-11)
- **Detailbeilage:** Das PDF aus der Word-Vorlage ist eine Beilage zur Rechnung, nicht die Rechnung selbst. Die Beispielvorlage wird auf `Briefpapier.dotx` aufgebaut. Ein eigener Button „Detailbeilage (PDF)“ pro Rechnung (Kundendetail und Tab „Rechnungen“) erzeugt das PDF jederzeit, auch wiederholt. Er ersetzt „PDF neu erzeugen“. Der automatische Export bei „Rechnung erstellen“ bleibt.
- **Domains:** Jede Domain ist eine eigene Position.
- **Ziel-Site:** `https://justelevate.sharepoint.com/sites/JustElevate-Kunden`. Sie ist in `config/serve.json` für die gehostete Workbench eingetragen.
