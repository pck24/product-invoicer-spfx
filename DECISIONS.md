# Entscheidungen

Annahmen und Festlegungen, die über `PLAN.md` hinausgehen oder davon abweichen.

## Abrechnungsmodell (Vorgabe vom 11.11.2026, ersetzt PLAN.md Abschnitt 4 „Modi“)

Das Modell ist bewusst einfach: **Jede Position hat einen Jahrespreis und eigene Zeiträume von–bis.**

- **Keine Modi** (Stichtag/Laufzeit), **keine Preisbasis**, **kein Abrechnungsmonat** beim Kunden und **kein** Feld „Verrechnen bis“.
- **Betrag** = Jahrespreis × Menge × Monate / 12, kaufmännisch auf Cent gerundet. Ein Zeitraum über 24 Monate kostet also den doppelten Jahrespreis.
- **Kein Vertragszeitraum** (Vorgabe vom 11.11.2026). Eine Position wird nur mit Bezeichnung, Menge, Jahrespreis und Laufzeit erfasst.
  - Ein Ende gibt es nur über „Kündigen“ (Spalte `Ende`, angezeigt als „Gekündigt zum“). „Kündigung aufheben“ setzt es zurück.
  - Die Spalte `Beginn` ist bei neu eingerichteten Listen keine Pflicht mehr. In bereits angelegten Listen ist sie Pflicht, deshalb wird beim Anlegen einer Position das Erfassungsdatum eingetragen. Gelesen wird sie nicht.
- **Erste Rechnung einer Position:** Es gibt keinen Vorschlag. Von und Bis werden frei gewählt, ohne Untergrenze. Nur „Bis“ darf nicht nach einem Kündigungsdatum liegen.
- **Folgerechnung:** Jede Position schließt nahtlos an „verrechnet bis“ an und läuft genau eine Laufzeit lang (`LaufzeitMonate`, Standard 12). Pro Position wird ein Zeitraum vorgeschlagen.
- **Monatsraster:** Die Grenzen werden ab dem ersten verrechneten Tag gerechnet. So wandern Monatsenden nicht. Beispiel: Start 31.01., Laufzeit 1 Monat ergibt 31.01.–27.02., 28.02.–30.03., 31.03.–29.04.
- **Fällig** ist ein Folgezeitraum, wenn er bereits läuft oder spätestens **3 Monate nach dem Rechnungsdatum** beginnt (`VORLAUF_MONATE`). Fällige Zeiträume sind im Vorschlag angehakt.
  - Spätere Zeiträume stehen ohne Häkchen in der Liste und können dazugenommen werden. Ein Beispiel ist eine Domain, die für 2 Jahre bezahlt ist.
  - Der Vorlauf ist kürzer als ein Jahr, damit nach dem Speichern derselbe Kunde nicht sofort wieder fällig ist. Ein zweiter Vorschlag ist dann leer.
- **Kündigung:** Ein Zeitraum wird auf das Leistungsende gekürzt und bekommt die Art `Anteilig`. Ist bis zum Ende verrechnet, entfällt die Position.
- **Lücke über mehrere Jahre:** Vorgeschlagen wird ein Zeitraum ab „verrechnet bis“. Den Zeitraum kann man bei Bedarf manuell bis zu einem späteren Datum verlängern, der Betrag wird dann anteilig berechnet.
- **Art:** `Folgezeitraum` (normal), `Anteilig` (auf das Leistungsende gekürzt), `Einmalig`. `Nachverrechnung` bleibt als Auswahlwert der Liste bestehen, wird aber nicht mehr automatisch vergeben.
- Die Plan-Testfälle „Abrechnungsjahr ab April“ und „Stichtag“ entfallen. Die übrigen Pflichtfälle sind auf das neue Modell umgestellt.
- **Huber-Referenz** (Rechnung vom 08.01.2027):
  - Vorgeschlagen werden M365 mit 750,00 € (Jahrespreis 150 € × 5) und die Domain .at mit 24,00 €.
  - Die Domain .com ist nicht fällig, das SSL-Zertifikat entfällt.
  - Das Cloud-Backup ist neu und wird manuell mit 01.08.2026–31.12.2027 erfasst: 17 Monate, 168,30 €.
  - Summe: **942,30 € netto, 188,46 € USt, 1.130,76 € brutto**.

## Datum und Geld

- Intern ist jedes Datum ein String im Format `YYYY-MM-DD`. Gerechnet wird mit date-fns über lokale Date-Objekte um Mitternacht.
- Bei der Monatsaddition wird das Monatsende begrenzt: 31.01. + 1 Monat ergibt 28.02. bzw. 29.02.
- **Monate:** Volle Monate werden am Raster gezählt. Resttage werden durch die Länge des angebrochenen Rastermonats geteilt. Gerundet wird auf 2 Dezimalstellen und intern als Integer `monateX100` geführt.
- Alle Beträge werden in Cent als Integer geführt. Gerundet wird kaufmännisch, halbe Cent vom Nullpunkt weg.
- **Einzelpreis auf der Rechnungsposition** ist der Jahrespreis je Stück. Die Menge steht daneben.
- Formatiert wird mit einer eigenen Funktion als `1.130,76 €`, weil `Intl` mit `de-AT` je nach Browser abweicht.
- Die USt wird auf die Nettosumme gerechnet, mit dem Satz aus dem Property Pane.

## Prüfungen

- **Rechnungsnummer:** Pflichtfeld. Sie wird ohne Rücksicht auf Groß- und Kleinschreibung und ohne Leerzeichen am Rand auf Eindeutigkeit geprüft.
- **Überschneidung** mit einer bestehenden Rechnungsposition derselben Position (Status Entwurf oder Erstellt) ist ein Fehler. Dasselbe gilt für Überschneidungen innerhalb derselben Rechnung.
- **Lücken:** Liegt „Von“ nach dem nächsten offenen Tag, gibt es eine Warnung. Ausnahme ist die erste Verrechnung, deren Zeitraum frei wählbar ist.
- **Bis nach dem Leistungsende** ist ein Fehler. Ebenso ist **Bis vor Von** ein Fehler.
- Einmalige Positionen dürfen ohne Zeitraum sein.
- Beim Bearbeiten eines Entwurfs schließt der Aufrufer dessen eigene Positionen und Nummer von der Prüfung aus.

## Datenebene

- **Schema** in `src/data/lists.ts`, angepasst an das vereinfachte Modell:
  - `AA_Kunden`: Kundennummer, Adresse, Aktiv
  - `AA_Positionen`: Kunde, Menge, Preis (angezeigt als „Jahrespreis“), LaufzeitMonate (Standard 12), Beginn, Ende
  - `AA_Rechnungen`: ohne „Stichtag“
- **Bestehende Spalten bleiben.** Wurden die Listen schon mit dem alten Schema angelegt, bleiben die alten Spalten (StichtagMonat, Preisbasis, Abrechnungsmodus, Stichtag) stehen. Sie werden nicht mehr gelesen oder geschrieben, denn die Einrichtung löscht nie etwas.
- **Spalten anlegen:** über `createFieldAsXml` mit festem internem Namen. Nur bei neu angelegten Listen bekommt die Title-Spalte einen Anzeigenamen. Bei `AA_Rechnungen` wird sie zusätzlich eindeutig und indiziert.
- **Datumsfelder** (DateOnly):
  - Es wird 12:00 UTC geschrieben, gelesen wird auf den nächstgelegenen Kalendertag gerundet.
  - Das funktioniert für Site-Zeitzonen von UTC−11 bis UTC+11.
- **Repositories:**
  - Gelesen werden höchstens 5.000 Elemente je Abfrage.
  - Eine Position lässt sich nur löschen, wenn keine Rechnungsposition auf sie verweist.
  - Rechnung anlegen: erst die Rechnung, dann die Positionen. Bei einem Fehler wird beides zurückgerollt.
  - Entwurf löschen: Der Status wird vorher frisch gelesen.

## Oberfläche

- **Kundenstatus**, bezogen auf heute:
  - **gelb „Fällig · n Zeiträume“:** Zeiträume laufen bereits, sind aber noch nicht verrechnet.
  - **rot „Neue Position · Zeitraum offen“:** Eine Position wurde noch nie verrechnet.
  - **grün „Verrechnet bis …“:** frühestes „verrechnet bis“.
  - **grau:** gekündigt, keine Positionen oder inaktiv.
- **Kennzahlen:**
  - „Nächster Abrechnungstermin“ ist der früheste nächste Zeitraum einer laufenden Position.
  - „Vorschlag gesamt“ ist die Summe der bereits laufenden, noch nicht verrechneten Zeiträume.
- **Gekündigt** bedeutet: Das Leistungsende liegt vor heute.
- **Kündigen** setzt das Leistungsende. Es darf nicht vor „verrechnet bis“ liegen.
- **Zeitleiste:** bis zu 5 Kalenderjahre. Entwürfe zählen als verrechnet. Als Vorschlag erscheinen nur fällige Zeiträume.
- **Datumsfelder** sind native Date-Inputs.
- **Kunden-Drawer:** Name, Kundennummer (Vorschlag `K-{NNNN}`), Adresse. Neue Kunden sind aktiv.
- **Rechnungsnummer** kommt aus deinem externen Rechnungssystem und wird manuell eingegeben. Es gibt kein Muster und keinen Vorschlag.

## Rechnungsdialog, Stornierung, Tab „Rechnungen“ (Phase 4)

- **Kopf:** Rechnungsnummer (Pflicht, live eindeutig) und Rechnungsdatum (Standard heute). Ändert sich das Datum, wird die Vorauswahl der Folgezeiträume neu bestimmt. Häkchen, die du selbst gesetzt hast, bleiben dabei unverändert.
- **Zeilen:** Es gibt eine Zeile pro Position, in dieser Reihenfolge:
  1. fällig: angehakt und vorbefüllt
  2. neu: leer; sobald Von und Bis gesetzt sind, wird die Zeile automatisch angehakt
  3. nicht fällig: vorbefüllt, ohne Häkchen
  4. entfällt: ausgegraut
- **Bearbeiten:** Von und Bis lassen sich ändern, dann wird der Betrag neu berechnet. Der Betrag selbst ist überschreibbar und wird dann als „Betrag manuell“ markiert. Leert man das Feld, gilt wieder der berechnete Betrag.
- **Einmalige Positionen:** Bezeichnung und Betrag sind Pflicht, der Zeitraum ist optional. Menge 1, Art `Einmalig`.
- **Speichern** (Entwurf oder Erstellt):
  - Rechnungen und Rechnungspositionen werden frisch gelesen und erneut geprüft. Bei Fehlern bricht das Speichern mit der Meldung „Daten haben sich geändert“ ab.
  - Danach wird die Rechnung angelegt (mit Rollback) und `Vorgaenger` auf die letzte erstellte Rechnung des Kunden gesetzt.
- **Entwurf bearbeiten** ist zusätzlich zum Plan möglich, sonst ließe sich ein Entwurf nie fertigstellen:
  - Beim Speichern werden die Positionen ersetzt, und der Kopf mit dem Status wird zuletzt aktualisiert.
  - Die eigenen Zeiträume und die eigene Nummer zählen nicht als Überschneidung.
- **Stornieren** (nur `Erstellt`, mit Bestätigung) setzt den Status auf `Storniert`. Die Zeiträume sind danach wieder frei.
- **Entwurf löschen** (mit Bestätigung) löscht Positionen und Rechnung.
- **Erstellte Rechnungen** sind schreibgeschützt. Das Menü bietet für sie nur PDF und Stornieren.
- **Tab „Rechnungen“:** alle Rechnungen mit Jahresfilter, Kundenlink, Status und demselben Aktionsmenü wie in der Rechnungshistorie.
- **Screen „Rechnung anzeigen“** (Vorgabe vom 11.11.2026). Er öffnet sich mit einem Klick auf eine Rechnung in der Rechnungshistorie oder im Tab „Rechnungen“ und nach dem Speichern im Rechnungsdialog. Aufbau von oben nach unten:
  1. Kopf mit Nummer, Status, Kunde, Rechnungsdatum, Vorgänger und Netto, rechts oben ein Menü „Aktionen“ mit allen Aktionen
  2. Positionen der Rechnung mit Summenblock
  3. Zeitleiste
- **Zeitleiste** nur noch in diesem Screen (aus dem Kundendetail entfernt):
  - eine Spur je Position der Rechnung
  - diese Rechnung dunkelblau, andere Rechnungen derselben Position hellblau
  - Kündigungsmarke, rote Markierung „Rechnungsdatum“ statt „heute“
- **Aktionsmenü:** Anzeigen, PDF öffnen, „Als PDF exportieren“ (bis Phase 5 deaktiviert), Entwurf bearbeiten/löschen, Stornieren.
- Die Spalte „Nächster Zeitraum“ in der Positionsliste ist auf deinen Wunsch entfallen.

## PDF-Export (Phase 5)

- **Zwei Varianten** (Vorgabe vom 11.11.2026), beide aus **einer** Vorlage:
  - **„Leistungsaufstellung“ mit Kosten:** Positionen mit Monaten, Jahrespreis, Betrag und Summen, dazu die Zeitleiste.
  - **„Leistungsübersicht“ ohne Kosten:** Positionen mit Menge und Zeitraum, dazu die Zeitleiste.
  - Gesteuert wird das über die Bedingungen `{#mitKosten}` und `{^mitKosten}`.
- **Automatik:** Bei „Rechnung erstellen“ wird automatisch die Variante mit Kosten exportiert. Eine bestehende Datei wird dabei nicht überschrieben. Ihr Link landet in `PdfLink`.
- **Manuell:** Beide Varianten lassen sich jederzeit über das Rechnungsmenü exportieren, dabei wird überschrieben. Die Variante ohne Kosten bekommt den Zusatz `_Leistungsuebersicht` im Dateinamen und wird nicht in `PdfLink` gespeichert.
- **Zeitleiste im PDF:** Sie ist als Word-Tabelle über den Raw-XML-Platzhalter `{@zeitleiste}` eingesetzt. Bilder bräuchten ein kostenpflichtiges docxtemplater-Modul.
  - Spalten sind Monate, ab mehr als 3 Jahren Quartale.
  - Zellen dieser Rechnung sind dunkelblau, andere Rechnungen hellblau.
  - Die rote Linie markiert das Rechnungsdatum, ein „|“ die Kündigung.
- **Property Pane:** Statt `@pnp/spfx-property-controls` gibt es Textfelder für serverrelative URLs, die live prüfen, ob Datei bzw. Ordner existiert. Die Property Controls bringen eine eigene React-17-Abhängigkeit mit, das Projekt läuft auf React 18.
- **Rechnungsnummernmuster** entfällt (siehe oben). Im Property Pane stehen also Vorlage, Export-Ordner, Dateiname und USt-Satz.
- **Graph:** `MSGraphClientV3`. Die Site wird über `/sites/{host}:{serverRelativeUrl}` gefunden, das DriveItem über `/sites/{id}/lists/{listId}/items/{itemId}/driveItem`. Fehlt die Freigabe, erscheint ein Hinweis auf „API-Zugriff“.
- **Leeres PDF aus SharePoint (behoben):** Das Briefpapier ist ein deckend weißes A4-Bild „hinter dem Text“ in der Kopfzeile. Die Online-Konvertierung zeichnet es über den Text und verdeckt so den gesamten Inhalt.
  - Die Vorlage enthält deshalb eine Version des Bildes mit transparentem Hintergrund (`docs/briefpapier-hintergrund.png`, erzeugt mit `docs/make-transparent.py`). Auf Weiß sieht sie identisch aus.
  - Außerdem entfernt die App beim Export Ordner-Einträge aus dem Archiv, und die Tabelleneigenschaften stehen in Schema-Reihenfolge.
  - **Für eigene Vorlagen gilt:** Hintergrundbilder müssen transparent sein.
- **Ausgabeformat** (Vorschlag vom 11.11.2026): Im Property Pane wählbar zwischen „PDF“ (Standard, über Graph) und „Word (.docx)“. Word legt das befüllte Dokument direkt ab, ohne Graph und ohne Freigabe.
- **Beispielvorlage** `docs/Rechnungsvorlage-Beispiel.docx` auf Basis von `Briefpapier.dotx`. Das Hintergrundbild liegt in der Kopfzeile. Die Ränder sind oben 4,0 cm und unten 3,5 cm, damit Logo und Fußzeile frei bleiben. Neu erzeugen lässt sie sich mit `docs/build-template.js`.

## Review vom 12.11.2026 (Qualität und Effizienz)

- **USt-Satz bei der Rechnung:** Im Rechnungsdialog frei eintragbar (vorbelegt aus den Webpart-Einstellungen) und beim Speichern gespeichert (neue Spalte `UstSatz` in `AA_Rechnungen`). Anzeige und Export alter Rechnungen ändern sich daher nicht mehr, wenn die Einstellung geändert wird. Rechnungen ohne gespeicherten Satz verwenden den aktuellen. Bei einer bereits eingerichteten Site bietet „Listen einrichten“ an, die Spalte zu ergänzen.
- **USt 0 %** ist gültig. Vorher wurde 0 % stillschweigend zu 20 %.
- **Storno einer älteren Rechnung:** Ihr Zeitraum ist wieder verrechenbar, auch wenn danach schon eine weitere Rechnung erstellt wurde. Gesperrt wird nur eine echte Überschneidung mit aktiven Zeiträumen. Die Regel „Von vor dem nächsten offenen Tag“ aus dem Plan entfällt, weil die Überschneidungsprüfung Doppelverrechnung bereits vollständig ausschließt.
- **Entwurf speichern:** Erst werden die neuen Positionen angelegt, dann die alten gelöscht. Ein Fehler mittendrin vernichtet den Entwurf nicht mehr.
- **Automatischer Export:** Eine schon vorhandene gleichnamige Datei wird weder überschrieben noch verknüpft. Es erscheint ein Hinweis.
- **Listen werden seitenweise gelesen** (über die Id), es gibt keine 5.000er-Grenze mehr.
- **Art „Nachverrechnung“** existiert nur noch als Auswahlwert der Liste. Beim Lesen wird sie als normaler Zeitraum behandelt.
- **Eine Quelle für fachliche Regeln:**
  - Fälligkeit (`statusFor`), Anteilig (`artFor`) und das Monatsraster (`resolveAnchor`) liegen nur im Billing-Kern.
  - Die Zeitleiste hat ein gemeinsames Modell für Bildschirm und Word/PDF.
  - Rechnungsansicht und Export lesen ihre Daten aus derselben Funktion.
  - Zahlen (Menge, USt-Satz) werden einheitlich mit `formatZahl` formatiert.
- **Effizienz:**
  - Kundenzusammenfassungen und Nachschlagetabellen werden einmal je Datenstand berechnet, nicht pro Bildschirm und Zeile.
  - Monatsberechnung in O(1).
  - Rechnungspositionen werden parallel gespeichert.
  - Nach dem PDF-Link wird nicht mehr alles neu geladen.
  - Graph-Abfragen laufen parallel, die Site-Id wird gemerkt.
  - Die Word-Bibliotheken bleiben bewusst im Hauptpaket. Nachladen hat beim Test einen Ladefehler verursacht und spart hier kaum etwas.
- **Bewusst nicht geändert:** Die Pflichtspalte `Beginn` in früher angelegten Listen bleibt Pflicht. Die Einrichtung baut bestehende Spalten nie um, deshalb füllt die App sie beim Anlegen weiter mit dem Erfassungsdatum.

## Toolchain

- SPFx 1.24.1 (Heft), React 18.3, TypeScript 5.8, Node 22 (`.nvmrc`), PnPjs 4, Fluent UI 9 mit dem Site-Theme (`tryGetThemeV2`).
- **Jest statt Vitest.** Jest ist in Heft integriert. `npm test` führt die Tests aus, `npm run build` macht Tests, Ship-Build und das `.sppkg`.
- Die Jest-Coverage ist abgeschaltet, weil Windows-Dateisperren (EPERM/EBUSY) den Build stören. Bei direkt aufeinanderfolgenden Builds kann so eine Sperre trotzdem auftreten. Ein erneuter Lauf behebt sie.
- Die Lint-Regel `@rushstack/no-new-null` ist aus, weil SharePoint `null` liefert.

## Weitere Vorgaben von dir (11.11.2026)

- **Detailbeilage:** Das PDF aus der Word-Vorlage (aufgebaut auf `Briefpapier.dotx`) ist eine Beilage zur Rechnung, nicht die Rechnung selbst.
  - Ein eigener Button „Detailbeilage (PDF)“ pro Rechnung erzeugt es jederzeit und ersetzt „PDF neu erzeugen“.
  - Der automatische Export bei „Rechnung erstellen“ bleibt.
- **Domains:** Jede Domain ist eine eigene Position.
- **Ziel-Site:** `https://justelevate.sharepoint.com/sites/JustElevate-Kunden`.
