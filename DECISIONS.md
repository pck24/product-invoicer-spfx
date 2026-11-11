# Entscheidungen

Annahmen und Festlegungen, die über `PLAN.md` hinausgehen oder davon abweichen.

## Abrechnungsmodell (Vorgabe vom 11.11.2026, ersetzt PLAN.md Abschnitt 4 „Modi“)

Das Modell ist bewusst einfach: **Jede Position hat einen Jahrespreis und eigene Zeiträume von–bis.**

- **Keine Modi** (Stichtag/Laufzeit), **keine Preisbasis**, **kein Abrechnungsmonat** beim Kunden und **kein** Feld „Verrechnen bis“.
- **Betrag** = Jahrespreis × Menge × Monate / 12, kaufmännisch auf Cent gerundet. Ein Zeitraum über 24 Monate kostet also den doppelten Jahrespreis.
- **Erste Rechnung einer Position:** Es gibt keinen Vorschlag. Von und Bis werden frei gewählt. Einzige Einschränkung: „Von“ darf nicht vor dem Vertragsbeginn liegen.
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
- **Zeitstrahl** im Kundendetail steht unter der Rechnungshistorie und erscheint erst, wenn es verrechnete Zeiträume gibt. Er zeigt die Vertragslaufzeit als hellblauen Balken, darüber die verrechneten Zeiträume dunkelblau und fällige Folgezeiträume gelb gestrichelt.
- Die Spalte „Nächster Zeitraum“ in der Positionsliste ist auf deinen Wunsch entfallen.

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
