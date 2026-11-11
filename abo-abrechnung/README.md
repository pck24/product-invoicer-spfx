# Abo-Abrechnung (SPFx-Webpart)

Verrechnung wiederkehrender Leistungen (Lizenzen, Domains, Cloud-Dienste) mit lückenlosen Leistungszeiträumen. Dazu kommt eine PDF-Beilage aus einer Word-Vorlage.

## Entwicklung

| Befehl | Zweck |
|---|---|
| `npm install` | Abhängigkeiten installieren (Node 22, siehe `.nvmrc`) |
| `npm start` | lokaler Server für die gehostete Workbench (`config/serve.json`) |
| `npm test` | Build und Tests (Jest) |
| `npm run build` | Tests, Ship-Build und Paket `sharepoint/solution/abo-abrechnung.sppkg` |

> Während `npm start` läuft, weder `npm test` noch `npm run build` starten. Beide leeren den Ausgabeordner, und die Workbench bekommt dann einen veralteten Stand.

## Einrichtung in SharePoint

1. **Paket bereitstellen:** `abo-abrechnung.sppkg` in den App-Katalog hochladen und bereitstellen.
2. **Graph-Berechtigung freigeben (einmalig):** Im SharePoint Admin Center unter **Erweitert → API-Zugriff** die ausstehende Anforderung *Microsoft Graph – Sites.ReadWrite.All* genehmigen.
   - Die Freigabe ist für die PDF-Umwandlung nötig, auch in der Workbench.
   - Sie gilt tenantweit für alle SPFx-Lösungen.
3. **Webpart einfügen:** Beim ersten Öffnen erscheint „Listen einrichten“. Der Button legt die Listen `AA_Kunden`, `AA_Positionen`, `AA_Rechnungen` und `AA_Rechnungspositionen` an. Bestehende Listen und Daten werden nie gelöscht oder umgebaut.
4. **PDF-Export einrichten** (Stift-Symbol am Webpart → Property Pane):
   - **Word-Vorlage:** serverrelative URL einer `.docx`, z. B. `/sites/JustElevate-Kunden/Freigegebene Dokumente/Vorlagen/Rechnungsvorlage.docx`. Als Ausgangspunkt dient `docs/Rechnungsvorlage-Beispiel.docx`.
   - **Export-Ordner:** serverrelative URL eines Ordners in einer Dokumentbibliothek.
   - **Dateiname:** Muster mit `{rechnungsnummer}`, `{kundennummer}` und `{kundenname}`.
   - **USt-Satz** in Prozent.

   Fehlen Vorlage oder Ordner, lässt sich die Rechnung trotzdem erstellen. Es erscheint dann ein Hinweis mit Link zu den Einstellungen.

## PDF-Export

Es gibt zwei Varianten, beide aus derselben Vorlage:

| Variante | Inhalt | Datei | Auslöser |
|---|---|---|---|
| **mit Kosten** („Leistungsaufstellung“) | Kopf, Positionen mit Monaten, Jahrespreis und Betrag, Summen, Zeitleiste | `{dateiname}.pdf`, Link in `AA_Rechnungen.PdfLink` | automatisch bei „Rechnung erstellen“ (überschreibt nie) und im Menü „PDF mit Kosten exportieren“ (überschreibt) |
| **ohne Kosten** („Leistungsübersicht“) | Kopf, Positionen mit Menge und Zeitraum, Zeitleiste | `{dateiname}_Leistungsuebersicht.pdf` | Menü „PDF ohne Kosten exportieren“ |

Ablauf:
1. Vorlage laden und mit docxtemplater befüllen.
2. Das Ergebnis als `_tmp_….docx` in den Export-Ordner hochladen.
3. Über Graph als PDF abrufen (`/drives/{id}/items/{id}/content?format=pdf`).
4. Das PDF ablegen und die temporäre Datei löschen.

### Platzhalter (Begrenzer `{` `}`)

```
{titel} {rechnungsnummer} {rechnungsdatum} {vorgaenger}
{kundenname} {kundennummer} {kundenadresse}
{#positionen}{bezeichnung} {von} {bis} {monate} {menge} {einzelpreis} {betrag} {art}{/positionen}
{summeNetto} {ustSatz} {ust} {summeBrutto}
{#mitKosten}…nur in der Variante mit Kosten…{/mitKosten}
{^mitKosten}…nur in der Variante ohne Kosten…{/mitKosten}
{#vorgaenger}…nur wenn es eine Vorgängerrechnung gibt…{/vorgaenger}
{@zeitleiste}   (eigener Absatz; wird durch die Zeitleisten-Tabelle ersetzt)
```

- Alle Werte kommen fertig formatiert an: Datum `TT.MM.JJJJ`, Beträge `1.130,76 €`.
- `{#positionen}` gehört in eine Tabellenzeile und wird pro Position wiederholt.
- Unbekannte Platzhalter werden leer ersetzt und als Warnung gemeldet.
- Die Beispielvorlage baut auf `Briefpapier.dotx` auf. `docs/build-template.js` erzeugt sie neu:
  `node docs/build-template.js ../Briefpapier.dotx docs/Rechnungsvorlage-Beispiel.docx node_modules/pizzip`
