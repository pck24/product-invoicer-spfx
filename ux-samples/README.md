# UX-Samples – Abo-Abrechnung

Statische HTML-Mockups als **verbindliche Vorlage für Optik und Aufbau** des Webparts (siehe `PLAN.md`, Abschnitt 5). Jede Datei lässt sich direkt im Browser öffnen; die Links zwischen den Screens funktionieren.

| Datei | Screen | Umsetzung in |
|---|---|---|
| `01-kundenuebersicht.html` | Kundenübersicht mit Kennzahlen, Filter und Kundentabelle | `ui/screens/CustomerList` |
| `02-kundendetail.html` | Kundendetail: Positionen, Zeitleiste, Rechnungshistorie | `ui/screens/CustomerDetail`, `components/Timeline` |
| `03-folgerechnung.html` | Folgerechnung: Kopf-Felder, Prüfung, Vorschlag, Summen | `ui/screens/InvoiceWizard` |
| `04-position-drawer.html` | Drawer „Position anlegen“; dasselbe Muster gilt für „Kunde anlegen“ | `components/Drawers` |

## So verwenden

- **Nachbauen mit Fluent UI v9**, nicht das HTML kopieren. Die Inline-Styles dienen nur als Referenz für Abstände, Farben und Hierarchie. Es gilt folgende Zuordnung:
  - Karten → `Card` oder eigenes `div` mit Token-Styles
  - Tabellen → `Table` / `DataGrid`
  - Badges → `Badge` (appearance `tint`)
  - Prüfungsbox → `MessageBar`
  - Drawer → `OverlayDrawer`
  - Buttons → `Button` (appearance `primary` bzw. `secondary`)
- **Farben als Fluent-Tokens**, keine festen Hex-Werte:
  - #0F6CBD → `colorBrandBackground`
  - #242424 → `colorNeutralForeground1`
  - #616161 → `colorNeutralForeground3`
  - #E0E0E0 → `colorNeutralStroke2`
  - #F5F5F5 → `colorNeutralBackground2`
  - Die Badge-Farben (gelb, rot, grün, blau) über `color="warning" | "danger" | "success" | "brand"`.
- **Die Inhalte sind Beispieldaten** (Bäckerei Huber). Sie entsprechen genau dem Pflicht-Testfall in `PLAN.md` Abschnitt 4, sodass die Zahlen im UI nach Phase 4 mit diesen Mockups übereinstimmen müssen.
- Die Zeitleiste in `02` ist mit festen Prozentwerten gezeichnet. Im Webpart werden die Positionen aus den echten Datumswerten berechnet.
- Responsive: Bei 375 px Breite stapeln sich Header und Toolbars, Tabellen scrollen horizontal in ihrer Karte – wie in den Mockups.
