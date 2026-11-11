# Abo-Abrechnung – SharePoint-Webpart (SPFx)

Umsetzungsplan für Claude Code. Arbeite die Phasen der Reihe nach ab. Am Ende jeder Phase müssen Build und Tests grün sein, dann committen.
**Grundsatz: so einfach wie möglich, nicht over-engineeren.**

---

## 1. Ziel

Ein leichtgewichtiges Webpart für meine Selbstständigkeit, mit dem ich wiederkehrende Leistungen verrechne: Lizenzen, Domain-Verlängerungen, Cloud-Dienste und Ähnliches. Die Positionen haben **unterschiedliche Laufzeiten**. Ich verrechne **einmal im Jahr** pro Kunde.

**Oberstes Ziel: Niemals doppelt oder zu viel verrechnen.** Jede Rechnungsposition deckt einen konkreten Leistungszeitraum (von–bis) einer Kundenposition ab. Neue Zeiträume schließen immer lückenlos an den bisher verrechneten Zeitraum an. Überschneidungen sind technisch ausgeschlossen.

Das Webpart soll:

- Kunden schnell erfassen lassen (Name, Kundennummer, Adresse)
- Positionen pro Kunde pflegen (Bezeichnung, Menge, Preis, Laufzeit, Vertrag von–bis, Kündigung)
- aus der letzten Rechnung eine **Folgerechnung** vorschlagen, deren Zeiträume fortlaufend anschließen
- die Rechnung speichern und zur Dokumentation als **PDF aus einer Word-Vorlage** exportieren

---

## 2. Tech-Stack

- **SPFx**, aktuelle Version. Prüfe vor dem Scaffolding die unterstützte Node-Version (`.nvmrc` anlegen).
- **React und TypeScript** im strict-Modus
- **Fluent UI v9** (`@fluentui/react-components`), Theme aus dem SharePoint-Site-Theme
- **PnPjs v4** (`@pnp/sp`) für die Listen und Dateien
- **@pnp/spfx-property-controls** für die Datei- und Ordnerauswahl im Property Pane
- **docxtemplater** und **pizzip** zum Befüllen der Word-Vorlage
- **MSGraphClientV3** (aus SPFx) für die Umwandlung von DOCX in PDF
- **date-fns**. Datumswerte sind reine Kalendertage im Format `YYYY-MM-DD`, ohne Uhrzeit.
- **Vitest** (oder Jest, falls sich das mit der SPFx-Toolchain einfacher integrieren lässt) für die Abrechnungslogik
- Beträge werden intern in **Cent als Integer** gerechnet und erst bei der Anzeige formatiert (`de-AT`, EUR).

Projektordner: `abo-abrechnung/`, Webpart-Name `AboAbrechnung`.

---

## 3. Datenmodell (4 SharePoint-Listen)

Listenpräfix `AA_`. Interne Spaltennamen sind ohne Umlaute und Leerzeichen.

### AA_Kunden
| Intern | Typ | Hinweis |
|---|---|---|
| Title | Text | Kundenname (Pflicht) |
| Kundennummer | Text | Pflicht, eindeutig, indiziert |
| Adresse | Mehrzeilig | |
| StichtagMonat | Zahl 1–12 | Beginn des Abrechnungsjahres, Standard 1 |
| Aktiv | Ja/Nein | Standard Ja |

Das Abrechnungsjahr beginnt immer am 1. des Monats `StichtagMonat`; bei 1 läuft es also vom 01.01. bis 31.12.

### AA_Positionen
| Intern | Typ | Hinweis |
|---|---|---|
| Title | Text | Bezeichnung auf der Rechnung, z. B. „Domain huber-baeckerei.at“ |
| Kunde | Lookup → AA_Kunden | Pflicht, indiziert |
| Menge | Zahl | Standard 1 |
| Preis | Währung | |
| Preisbasis | Auswahl | `Monat` oder `Laufzeit` |
| LaufzeitMonate | Zahl | 1, 12, 24 … |
| Abrechnungsmodus | Auswahl | `Stichtag` oder `Laufzeit`; der Standard ergibt sich aus der Laufzeit (siehe Abschnitt 4) |
| Beginn | Datum | Pflicht |
| Ende | Datum | leer bedeutet aktiv |

Es gibt keinen Produktkatalog. Beim Anlegen einer Position schlägt eine Combobox die Bezeichnungen bereits vorhandener Positionen vor; eine Auswahl übernimmt deren Preis, Preisbasis, Laufzeit und Modus als Vorbelegung.

Es gibt auch **kein Feld „verrechnet bis“**. Der Wert wird immer aus den Rechnungspositionen berechnet.

### AA_Rechnungen
| Intern | Typ | Hinweis |
|---|---|---|
| Title | Text | Rechnungsnummer, Pflicht, eindeutig, indiziert |
| Kunde | Lookup → AA_Kunden | |
| Rechnungsdatum | Datum | |
| Stichtag | Datum | „Verrechnen bis“ |
| Vorgaenger | Lookup → AA_Rechnungen | |
| Status | Auswahl | `Entwurf`, `Erstellt` oder `Storniert` |
| SummeNettoCent | Zahl | |
| PdfLink | Hyperlink | das exportierte PDF |

### AA_Rechnungspositionen
| Intern | Typ | Hinweis |
|---|---|---|
| Title | Text | Bezeichnung als Snapshot |
| Rechnung | Lookup → AA_Rechnungen | indiziert |
| Position | Lookup → AA_Positionen | leer bei einmaligen Positionen, indiziert |
| Von | Datum | |
| Bis | Datum | |
| Monate | Zahl (2 Dezimalstellen) | |
| Menge | Zahl | |
| EinzelpreisCent | Zahl | |
| BetragCent | Zahl | |
| Art | Auswahl | `Folgezeitraum`, `Anteilig`, `Nachverrechnung` oder `Einmalig` |

### Provisionierung
Beim ersten Laden prüft das Webpart, ob die Listen und Spalten existieren:

- **Fehlt etwas**, zeigt es den Bildschirm „Listen einrichten“. Der Button legt die fehlenden Listen und Spalten idempotent an.
- **Bestehende Listen, Spalten und Daten werden nie gelöscht oder umgebaut.**

---

## 4. Abrechnungslogik (Kern, vollständig getestet)

Die Logik liegt als reines TypeScript-Modul ohne SharePoint-Abhängigkeit unter `src/billing/`.

### Begriffe
- **verrechnetBis(pos)** ist das maximale `Bis` aller Rechnungspositionen dieser Position mit Rechnungsstatus `Entwurf` oder `Erstellt`. Gibt es keine, ist der Wert `null`.
- **nextStart(pos)** ist `verrechnetBis + 1 Tag` oder, falls `null`, der `Beginn`.
- **Abrechnungsjahr** zum Stichtag `S` ist der Zeitraum `[J, S]` mit `J = S − 12 Monate + 1 Tag`.
- **Leistungsende** ist `Ende`, falls gesetzt, sonst unbegrenzt.

### Modus `Stichtag` (Standard, wenn LaufzeitMonate < 12)
Für Monatsdienste und Lizenzen, die zum Abrechnungsjahr laufen:
1. Ist `nextStart > S` oder `nextStart > Leistungsende`, entsteht nichts; die Position ist nicht fällig.
2. Ist `nextStart < J`, wird zuerst ein Segment `[nextStart, J − 1]` erzeugt, gekürzt auf das Leistungsende. Es bekommt die Art `Anteilig` oder, wenn es länger als 12 Monate zurückreicht, die Art `Nachverrechnung`.
3. Danach folgt das Segment `[max(nextStart, J), min(S, Leistungsende)]` mit Art `Folgezeitraum`, oder `Anteilig`, wenn es kürzer als das volle Jahr ist.

### Modus `Laufzeit` (Standard, wenn LaufzeitMonate ≥ 12)
Für Domains und alles mit eigenem Jahrestag, im Voraus verrechnet:
1. Solange `nextStart ≤ S` und `nextStart ≤ Leistungsende`:
   - Das Segment ist `[nextStart, nextStart + Laufzeit − 1 Tag]`, gekürzt auf das Leistungsende.
   - Das erste Segment bekommt die Art `Folgezeitraum`, jedes weitere die Art `Nachverrechnung`.
2. Andernfalls ist die Position nicht fällig. Im Vorschlag erscheint sie ausgegraut mit „nicht fällig, verrechnet bis …“.

### Monate und Beträge
- **Monate**: Es zählen volle Kalendermonate; für Resttage gilt `Resttage / Tage des Monats`. Gerundet wird auf 2 Dezimalstellen.
- **Betrag**:
  - Preisbasis `Monat`: `Preis × Menge × Monate`
  - Preisbasis `Laufzeit`: `Preis × Menge × Monate / LaufzeitMonate`
  - Gerundet wird pro Zeile kaufmännisch auf Cent.
- **Summen**: Die USt (Satz im Property Pane) wird auf die Nettosumme gerechnet.

### Prüfungen (vor dem Speichern, gegen frisch gelesene Daten)
- **Fehler, Speichern blockiert:**
  - ein Segment überschneidet sich mit einer bestehenden Rechnungsposition derselben Position (Status `Entwurf` oder `Erstellt`)
  - `Von` liegt vor `nextStart`
  - `Bis` liegt vor `Von`
  - `Bis` liegt nach dem Leistungsende
  - die Rechnungsnummer existiert bereits
- **Warnung:** `Von` liegt nach `nextStart`, es entsteht also eine Lücke.

### Stornierung
- Eine Rechnung mit Status `Erstellt` wird nicht gelöscht, sondern auf `Storniert` gesetzt. Damit sind ihre Zeiträume wieder frei.
- Ein `Entwurf` darf gelöscht werden.
- Eine Rechnung mit Status `Erstellt` ist schreibgeschützt.

### Pflicht-Testfälle
Das Referenzbeispiel ist **Bäckerei Huber, Stichtag 31.12.2027**:

| Position | Daten | Erwartung |
|---|---|---|
| Microsoft 365 × 5 | 12,50 €/Monat, Modus Stichtag, verrechnet bis 31.12.2026 | 01.01.–31.12.2027, **750,00 €** |
| Domain .at | 24,00 €/Laufzeit, 12 Monate, verrechnet bis 14.03.2027 | 15.03.2027–14.03.2028, **24,00 €** |
| Domain .com | 36,00 €/Laufzeit, 24 Monate, verrechnet bis 31.08.2028 | **nicht fällig** |
| Cloud-Backup | 9,90 €/Monat, Beginn 01.08.2026, nie verrechnet | 01.08.–31.12.2026 anteilig, **49,50 €**, dazu 2027 mit **118,80 €** |
| SSL-Zertifikat | Ende 30.06.2026, verrechnet bis 30.06.2026 | **entfällt** |

Summen: **942,30 € netto, 188,46 € USt, 1.130,76 € brutto.**

Weitere Fälle, die getestet werden müssen:
- Kündigung mitten im Zeitraum
- Lücke über mehrere Jahre
- Schaltjahr
- Monatsende (31.01. plus 1 Monat)
- Abrechnungsjahr ab April
- Überschneidung muss als Fehler erkannt werden
- Stornierung gibt die Zeiträume wieder frei

---

## 5. UX (entspricht dem freigegebenen Mockup)

Allgemein:
- Native Fluent-v9-Optik. Hintergrund #F5F5F5; Inhalte liegen in weißen Karten mit 1 px Rand #E0E0E0 und 8 px Radius. Die maximale Breite ist 1240 px.
- Tabellen mit tabellarischen Ziffern, Beträge rechtsbündig, Datumsformat `TT.MM.JJJJ`.
- Statusbadges:
  - gelb für „Fällig · n Zeiträume“
  - rot für „Neue Position · anteilig offen“
  - grün für „Verrechnet bis …“
  - grau für „gekündigt“
  - blau für „neu“ und „anteilig nachverrechnet“
- Navigation über internen Zustand mit Breadcrumb, ohne Seitenwechsel.
- Ladezustände als Skeletons, Fehler als MessageBar, Erfolg als Toast.
- Responsive: Unter 640 px stapelt sich der Inhalt, Tabellen scrollen horizontal in ihrer Karte.
- Barrierefreiheit: echte Buttons und Labels, `aria-label` auf Icon-Buttons.

### Screen 1 – Kundenübersicht
- **Header-Karte**: Titel „Abo-Abrechnung“, die Suche (Name oder Kundennummer) und der Primärbutton „+ Kunde anlegen“
- **Tabs**: Kunden | Rechnungen
- **Drei Kennzahlen**: nächster Abrechnungstermin; Kunden mit offenen Zeiträumen; Vorschlag gesamt netto
- **Filter-Pills**: Alle | Fällig | Aktuell
- **Tabelle** mit den Spalten Kd.-Nr., Name, Aktive Positionen, Letzte Rechnung, Status und dem Link „Öffnen“. Die ganze Zeile ist klickbar.

### Screen 2 – Kundendetail
- **Header**: Name, Kundennummer-Chip, „Abrechnung jährlich zum …“ und die Adresse. Buttons: Bearbeiten | + Position | **Folgerechnung erstellen** (primär; deaktiviert, wenn nichts fällig ist).
- **Karte „Positionen“** mit Schalter „Gekündigte anzeigen“. Spalten: Produkt, Menge, Preis, Laufzeit, Vertrag von – bis, Verrechnet bis und Nächster Zeitraum (gelb und fett, wenn fällig; grün „nicht fällig“; grau „entfällt“). Das Zeilenmenü bietet Bearbeiten, Kündigen und Löschen (nur solange die Position nie verrechnet wurde).
- **Karte „Zeitleiste“**:
  - Jahresraster mit einer Spur pro Position
  - verrechnete Segmente gefüllt in der Brand-Farbe, Vorschläge gelb gestrichelt
  - Kündigungsmarke grau, „heute“ rot, dazu eine Legende
  - Tooltip auf einem Segment: Rechnungsnummer, Zeitraum, Betrag
- **Karte „Rechnungshistorie“** mit den Spalten Nr., Datum, Positionen, Netto, Status und dem Link „PDF öffnen“.

### Screen 3 – Folgerechnung erstellen
- **Kopf-Felder**: Rechnungsnummer (nächste freie Nummer nach `RE-{YYYY}-{NNN}` vorgeschlagen, editierbar, live auf Eindeutigkeit geprüft), Rechnungsdatum und „Verrechnen bis Stichtag“. Eine Änderung des Stichtags berechnet den Vorschlag neu.
- **Prüfungs-MessageBar**: grün, gelb oder rot
- **Tabelle der vorgeschlagenen Positionen**:
  - Spalten: Checkbox, Position, Von, Bis, Monate, Einzelpreis, Betrag, Hinweis
  - Von, Bis und Betrag sind inline editierbar, jede Änderung löst eine neue Prüfung aus
  - nicht fällige und gekündigte Positionen stehen ausgegraut am Ende
  - Button „+ Einmalige Position“
- **Summenblock**: Netto, USt und Brutto
- **Footer**: Abbrechen | Als Entwurf speichern | **Rechnung erstellen**
- **Rechnung erstellen**: Zuerst wird gespeichert (zuerst die Rechnung, dann die Positionen). Schlägt das fehl, wird die Rechnung wieder entfernt. Danach folgt automatisch der PDF-Export (Abschnitt 6) mit Fortschrittsanzeige und am Ende ein Toast „PDF abgelegt“ mit Link.
- Die erste Rechnung eines Kunden läuft über denselben Dialog, nur ohne Vorgänger.

### Drawers
- **Kunde anlegen/bearbeiten**: Name, Kundennummer (Vorschlag `K-{NNNN}`, eindeutig), Adresse, Abrechnungsmonat
- **Position anlegen/bearbeiten**: Combobox für die Bezeichnung mit Vorschlägen, dazu Menge, Preis, Preisbasis, Laufzeit, Modus, Beginn und Ende. Unten eine Live-Vorschau: „Wird erstmals verrechnet: …“.

### Tab „Rechnungen“
Liste aller Rechnungen mit Filter nach Jahr und den Aktionen PDF öffnen, PDF neu erzeugen, Stornieren (mit Bestätigung) und Entwurf löschen.

---

## 6. PDF-Export aus Word-Vorlage

Zweck: Jede erstellte Rechnung wird zur Dokumentation als PDF abgelegt.

### Konfiguration im Property Pane
- **Word-Vorlage**: Auswahl einer `.docx`-Datei aus SharePoint (`PropertyFieldFilePicker`). Gespeichert wird die serverrelative URL.
- **Export-Ordner**: Auswahl eines Ordners in einer Dokumentbibliothek (`PropertyFieldFolderPicker`)
- **Dateiname**: Muster, Standard `{rechnungsnummer}_{kundennummer}_{kundenname}`. Ungültige Zeichen werden ersetzt.

Fehlt die Vorlage oder der Ordner, ist „Rechnung erstellen“ trotzdem möglich. Statt des Exports erscheint dann ein Hinweis mit Link zum Property Pane; das PDF kann später über „PDF neu erzeugen“ nachgeholt werden.

### Ablauf
1. Vorlage per PnPjs als ArrayBuffer laden.
2. Mit docxtemplater befüllen; die Platzhalter stehen weiter unten.
3. Das Ergebnis als temporäre `.docx` in den Export-Ordner hochladen, mit dem Präfix `_tmp_`.
4. Über Graph als PDF abrufen: `GET /drives/{driveId}/items/{itemId}/content?format=pdf`. Die Drive- und Item-ID werden über `GET /sites/{hostname}:/{serverRelativeSiteUrl}` und `.../drive/root:/{pfad}` ermittelt.
5. Das PDF als `{dateiname}.pdf` in den Export-Ordner hochladen. Existiert die Datei schon, wird sie nur bei „PDF neu erzeugen“ überschrieben.
6. Die temporäre `.docx` löschen.
7. Den PDF-Link in `AA_Rechnungen.PdfLink` speichern.

Graph-Berechtigung: In `package-solution.json` wird `webApiPermissionRequests` für Microsoft Graph `Sites.ReadWrite.All` eingetragen. Im README steht der Hinweis, dass die Freigabe einmalig im SharePoint Admin Center unter „API-Zugriff“ erfolgen muss.

### Platzhalter (docxtemplater, Begrenzer `{` `}`)
```
{rechnungsnummer} {rechnungsdatum} {stichtag} {vorgaenger}
{kundenname} {kundennummer} {kundenadresse}
{#positionen}{bezeichnung} {von} {bis} {monate} {menge} {einzelpreis} {betrag} {art}{/positionen}
{summeNetto} {ustSatz} {ust} {summeBrutto}
```
- Alle Werte werden fertig formatiert als Strings übergeben (Datum `TT.MM.JJJJ`, Beträge `1.130,76 €`).
- `{#positionen}` ist als Tabellenzeilen-Schleife gedacht.
- Unbekannte Platzhalter führen nicht zum Absturz; sie werden leer ersetzt und als Warnung gemeldet.
- Im Repo liegt eine Beispielvorlage `docs/Rechnungsvorlage-Beispiel.docx`, die alle Platzhalter enthält.

---

## 7. Property Pane (komplett)

- Word-Vorlage
- Export-Ordner
- Dateinamenmuster
- USt-Satz (Standard 20)
- Rechnungsnummernmuster (Standard `RE-{YYYY}-{NNN}`)

Mehr nicht.

---

## 8. Projektstruktur

```
abo-abrechnung/
  src/
    billing/            # reine Logik + Tests
      dates.ts  money.ts  periods.ts  proposal.ts  validation.ts
      __tests__/
    data/
      lists.ts  provisioning.ts  repositories.ts
    export/
      pdfExport.ts      # Vorlage laden, befüllen, Graph-Konvertierung, ablegen
    ui/
      App.tsx
      screens/          # CustomerList, CustomerDetail, InvoiceWizard, Invoices, Setup
      components/       # StatusBadge, Timeline, KpiCard, Drawers …
    webparts/aboAbrechnung/
  docs/Rechnungsvorlage-Beispiel.docx
```

---

## 9. Phasen und Abnahme

1. **Scaffold und Billing-Kern**
   - SPFx-Projekt, Testsetup und `src/billing/` umsetzen
   - Abnahme: Alle Testfälle sind grün, die Huber-Summen stimmen auf den Cent.
2. **Datenebene**
   - Provisionierung der 4 Listen und die Repositories
   - Abnahme: Eine leere Site wird korrekt eingerichtet, und ein zweiter Lauf ändert nichts.
3. **UI für Kunden und Positionen**
   - Screen 1, Screen 2 mit Zeitleiste und die Drawers
   - Abnahme: Die Optik entspricht dem Mockup, und alles funktioniert bei 375 px Breite.
4. **Folgerechnung**
   - Screen 3, Speichern mit Neuprüfung, Stornierung und der Tab „Rechnungen“
   - Abnahme: Das Huber-Szenario lässt sich end-to-end durchspielen, und ein zweiter Vorschlag ist leer.
5. **PDF-Export**
   - Property Pane, Export und Beispielvorlage
   - Abnahme: „Rechnung erstellen“ legt ein korrekt befülltes PDF im konfigurierten Ordner ab; es bleibt keine temporäre `.docx` zurück.

Nach jeder Phase: `npm test`, den Ship-Build und das `.sppkg` erzeugen (die Befehle hängen von der SPFx-Version ab), dann committen.

---

## 10. Arbeitsregeln für Claude Code

- Rechne Geld nie mit Floats und Datumswerte nie mit Uhrzeiten.
- Lösche oder verändere keine bestehenden Listen oder Daten außerhalb der beschriebenen Aktionen.
- Implementiere die Billing-Logik testgetrieben und halte die UI dünn.
- **Nichts einbauen, was hier nicht steht.** Bei Unklarheiten: eine sinnvolle Annahme treffen, sie in `DECISIONS.md` festhalten und weitermachen.
- Nicht im Umfang: Produktkatalog, Zahlungseingänge, Mahnwesen, Buchhaltungsexport, Sammellauf, Fremdwährungen.
