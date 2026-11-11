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

## Phase 2 – Datenebene

### Provisionierung
- **Schema** steht deklarativ in `src/data/lists.ts`. `planProvisioning` ermittelt ohne SharePoint-Zugriff, was fehlt, und ist getestet. Bei einer leeren Site sind das alle Listen und Spalten, bei einer vollständigen nichts, bei einer teilweise eingerichteten nur das Fehlende.
- Spalten werden per `createFieldAsXml` mit festem internem Namen angelegt (Option `AddFieldInternalNameHint`) und in die Standardansicht aufgenommen.
- **Nur bei neu angelegten Listen** bekommt die Title-Spalte einen Anzeigenamen (Kundenname, Bezeichnung, Rechnungsnummer). Bei `AA_Rechnungen` wird sie zusätzlich eindeutig und indiziert. Bestehende Listen bleiben unverändert.
- Gibt es eine Liste schon, aber eine Spalte fehlt, wird nur die Spalte ergänzt.
- Die Listen erscheinen nicht in der Schnellstartleiste.
- **Anzeigenamen mit Umlauten** sind erlaubt, etwa „Vorgänger“ oder „Laufzeit (Monate)“. Die internen Namen entsprechen genau dem Plan.
- Die Spalte `Preis` hat den Typ Währung mit LCID 3079 (de-AT). Intern wird sie beim Lesen und Schreiben in Cent umgerechnet.
- Lookups löschen nicht kaskadierend. Gelöscht wird nur über die im Plan beschriebenen Aktionen.

### Datumsfelder in SharePoint
- Die Spalten haben den Typ DateTime mit Format `DateOnly`. SharePoint speichert solche Werte als Mitternacht in der Zeitzone der Site und liefert sie in UTC. Für Wien kommt der 01.01.2027 also als `2026-12-31T23:00:00Z` zurück.
- Deshalb wird **12:00 UTC geschrieben**, und beim Lesen wird auf den nächstgelegenen Kalendertag gerundet (+12 h, Datumsteil). Das funktioniert für Site-Zeitzonen zwischen UTC−11 und UTC+11.

### Repositories
- Gelesen werden höchstens 5.000 Elemente je Abfrage, ohne Paging. Für eine Einzelunternehmer-Abrechnung reicht das.
- **Position löschen** ist nur erlaubt, wenn keine Rechnungsposition auf sie verweist, auch keine stornierte.
- **Rechnung anlegen:** Zuerst wird die Rechnung gespeichert, dann die Positionen nacheinander. Schlägt ein Schritt fehl, werden die schon angelegten Positionen und die Rechnung wieder gelöscht.
- **Entwurf löschen:** Der Status wird vorher frisch gelesen. Gelöscht wird nur bei `Entwurf`, dann zuerst die Positionen und danach die Rechnung.

### Toolchain
- Die Jest-Coverage ist abgeschaltet (`config/jest.config.json`). Unter Windows sperrt der Virenscanner den Ausgabeordner gelegentlich (EPERM/EBUSY). Bei direkt aufeinanderfolgenden Builds kann eine solche Sperre auch im Jest-Cache auftreten. Ein erneuter Lauf behebt sie.
- Die Beispielkomponente und die Lokalisierungsdateien aus dem Scaffold sind entfernt. Die Oberfläche ist nur deutsch.
- Das Theme ist das Fluent-v9-Theme der Site (`ThemeProvider.tryGetThemeV2()`, ab SPFx 1.24). Ersatzweise wird `webLightTheme` verwendet.

## Phase 3 – UI für Kunden und Positionen

- **Status in der Kundenübersicht** wird gegen den Standard-Stichtag ab heute berechnet:
  - **rot „Neue Position · anteilig offen“:** Alle fälligen Positionen wurden noch nie verrechnet.
  - **gelb „Fällig · n Zeiträume“:** Es gibt fällige Zeiträume, mindestens einer davon bei einer schon verrechneten Position.
  - **grün „Verrechnet bis …“:** Nichts ist fällig. Angezeigt wird das früheste „verrechnet bis“ der noch laufenden Positionen.
  - **grau:** „gekündigt“ (alle Positionen beendet), „keine Positionen“ oder „inaktiv“.
- **Kennzahl „Nächster Abrechnungstermin“** ist der früheste Beginn des Abrechnungsjahres unter den fälligen Kunden.
- **Gekündigt** bedeutet: Das Leistungsende liegt vor heute. Solche Positionen erscheinen grau und durchgestrichen und lassen sich über den Schalter ausblenden. Ein Leistungsende in der Zukunft wird nur als Vertragsende angezeigt.
- **Kündigen** öffnet einen Dialog für das Leistungsende. Es darf nicht vor „verrechnet bis“ liegen, weil sonst ein bereits verrechneter Zeitraum über das Ende hinausginge.
- **Löschen** steht im Zeilenmenü nur, solange keine Rechnungsposition auf die Position verweist, auch keine stornierte.
- **Zeitleiste:** Sie zeigt bis zu 5 Kalenderjahre und endet mit dem spätesten Datum. Entwürfe zählen als verrechnet, im Tooltip steht „(Entwurf)“. Bei gekündigten Positionen sind die Segmente blasser.
- **Datumsfelder** sind native Date-Inputs (`type="date"`). Fluent v9 hat keinen stabilen DatePicker im Kernpaket, und der Browser zeigt das Datum ohnehin im Format TT.MM.JJJJ an.
- **Kunde anlegen:** Das Feld „Aktiv“ fehlt im Drawer, weil es im Plan nicht vorgesehen ist. Neue Kunden sind immer aktiv.
- **Button-Text:** Ohne bisherige Rechnung heißt der Button „Erste Rechnung erstellen“, sonst „Folgerechnung erstellen“. Beide öffnen denselben Dialog.

## Vorgaben von dir (2026-11-11)
- **Detailbeilage:** Das PDF aus der Word-Vorlage ist eine Beilage zur Rechnung, nicht die Rechnung selbst. Die Beispielvorlage wird auf `Briefpapier.dotx` aufgebaut. Ein eigener Button „Detailbeilage (PDF)“ pro Rechnung (Kundendetail und Tab „Rechnungen“) erzeugt das PDF jederzeit, auch wiederholt. Er ersetzt „PDF neu erzeugen“. Der automatische Export bei „Rechnung erstellen“ bleibt.
- **Domains:** Jede Domain ist eine eigene Position.
- **Kein Abrechnungsmodus in der Oberfläche.** Der Modus ergibt sich aus der Preisbasis:
  - **pro Monat → Stichtag:** Verrechnet wird bis zum Ende des Abrechnungsjahres.
  - **pro Laufzeit → Laufzeit:** Verrechnet wird je volle Laufzeit ab dem eigenen Verlängerungsdatum, im Voraus.

  Die Spalte `Abrechnungsmodus` bleibt in der Liste und wird beim Speichern mit dem abgeleiteten Wert gefüllt. Beim Lesen wird der Wert immer aus der Preisbasis abgeleitet. Das ersetzt die Regel aus dem Plan („Standard aus LaufzeitMonate“). Alle Huber-Pflichtfälle bleiben unverändert.
- **Rechnungsnummer** kommt aus deinem externen Rechnungssystem und wird manuell eingegeben. Deshalb gibt es kein Rechnungsnummernmuster im Property Pane und keinen Nummernvorschlag. Das Feld startet leer, ist Pflicht und wird live auf Eindeutigkeit geprüft. Das Muster `K-{NNNN}` für Kundennummern bleibt.
- **Ziel-Site:** `https://justelevate.sharepoint.com/sites/JustElevate-Kunden`. Sie ist in `config/serve.json` für die gehostete Workbench eingetragen.
