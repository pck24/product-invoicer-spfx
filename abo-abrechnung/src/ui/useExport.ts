import * as React from 'react';
import { ustSatzOf } from '../data/mapping';
import { ExportNotConfiguredError, exportPdf, GraphAccessError } from '../export/pdfExport';
import { ExportVariante, IExportInput } from '../export/templateData';
import { useApp } from './AppContext';
import { errorText, IAppData, useData } from './DataContext';

/** Daten einer Rechnung für Anzeige und Export (eine Quelle, damit beide übereinstimmen). */
export function buildExportInput(data: IAppData, rechnungId: number, ustSatz: number): IExportInput | undefined {
  const rechnung = data.rechnungById[rechnungId];
  if (!rechnung) return undefined;
  return {
    rechnung,
    kunde: rechnung.kundeId !== null ? data.kundeById[rechnung.kundeId] : undefined,
    vorgaenger: rechnung.vorgaengerId ? data.rechnungById[rechnung.vorgaengerId] : undefined,
    lines: data.zeilenJeRechnung[rechnung.id] || [],
    positionen: data.positionen.filter((p) => p.kundeId === rechnung.kundeId),
    billedLines: data.billedLines,
    ustSatz: ustSatzOf(rechnung, ustSatz)
  };
}

export interface IExportRun {
  /** führt den Export aus; true bei Erfolg */
  run: (data: IAppData, rechnungId: number, variante: ExportVariante, overwrite: boolean) => Promise<boolean>;
  /** aktueller Fortschritt, undefined = nicht aktiv */
  busy: string | undefined;
}

export function useExport(): IExportRun {
  const { exportEnv, settings, repo, openSettings } = useApp();
  const { notify, patchRechnung } = useData();
  const [busy, setBusy] = React.useState<string | undefined>();

  const run = React.useCallback(
    async (data: IAppData, rechnungId: number, variante: ExportVariante, overwrite: boolean): Promise<boolean> => {
      const input = buildExportInput(data, rechnungId, settings.ustSatz);
      if (!input) return false;
      setBusy('Export wird erzeugt …');
      try {
        const res = await exportPdf(exportEnv, settings, input, variante, { overwrite, onProgress: setBusy });
        if (res.existed) {
          // Eine gleichnamige Datei stammt evtl. von einer anderen (gelöschten) Rechnung → nicht verknüpfen
          notify(
            `Datei „${res.name}“ existiert bereits und wurde weder überschrieben noch verknüpft. Neu erzeugen über „Mit Kosten exportieren“.`,
            'warning'
          );
          return false;
        }
        // Die Variante mit Kosten ist die Dokumentation der Rechnung → Link speichern (lokal nachziehen statt neu laden)
        if (variante === 'mitKosten' && input.rechnung.pdfUrl !== res.url) {
          await repo.setPdfLink(input.rechnung.id, res.url, res.name);
          patchRechnung(input.rechnung.id, { pdfUrl: res.url });
        }
        notify('Datei abgelegt', 'success', { text: res.name, url: res.url });
        if (res.warnings.length) notify(`Unbekannte Platzhalter in der Vorlage (leer ersetzt): ${res.warnings.join(', ')}`, 'warning');
        return true;
      } catch (e) {
        if (e instanceof ExportNotConfiguredError) {
          notify('Export nicht eingerichtet: Word-Vorlage und Export-Ordner fehlen.', 'warning', { text: 'Einstellungen öffnen', onClick: openSettings });
        } else if (e instanceof GraphAccessError) {
          notify(
            'Kein Zugriff auf Microsoft Graph für die PDF-Umwandlung. Die Berechtigung „Sites.ReadWrite.All“ muss einmalig im SharePoint Admin Center unter „API-Zugriff“ freigegeben werden – oder im Webpart „Word (.docx)“ als Ausgabeformat wählen.',
            'error'
          );
        } else {
          notify(`Export fehlgeschlagen: ${errorText(e)}`, 'error');
        }
        return false;
      } finally {
        setBusy(undefined);
      }
    },
    [exportEnv, settings, repo, openSettings, notify, patchRechnung]
  );

  return { run, busy };
}
