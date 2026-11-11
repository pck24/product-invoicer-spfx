import * as React from 'react';
import { ExportNotConfiguredError, exportPdf } from '../export/pdfExport';
import { ExportVariante, IExportInput } from '../export/templateData';
import { useApp } from './AppContext';
import { errorText, IAppData, useData } from './DataContext';

/** Eingabedaten für den Export aus den geladenen Listen. */
export function buildExportInput(data: IAppData, rechnungId: number, ustSatz: number): IExportInput | undefined {
  const rechnung = data.rechnungen.filter((r) => r.id === rechnungId)[0];
  if (!rechnung) return undefined;
  return {
    rechnung,
    kunde: data.kunden.filter((k) => k.id === rechnung.kundeId)[0],
    vorgaenger: rechnung.vorgaengerId ? data.rechnungen.filter((r) => r.id === rechnung.vorgaengerId)[0] : undefined,
    lines: data.rechnungspositionen.filter((l) => l.rechnungId === rechnung.id),
    positionen: data.positionen.filter((p) => p.kundeId === rechnung.kundeId),
    billedLines: data.billedLines,
    ustSatz
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function exportErrorText(e: any): string {
  const status = e && (e.statusCode || e.status);
  if (status === 401 || status === 403 || /access ?denied|authorization|consent/i.test(errorText(e))) {
    return 'Kein Zugriff auf Microsoft Graph. Die Berechtigung „Sites.ReadWrite.All“ muss einmalig im SharePoint Admin Center unter „API-Zugriff“ freigegeben werden.';
  }
  return errorText(e);
}

export interface IExportRun {
  /** führt den Export aus; true bei Erfolg */
  run: (data: IAppData, rechnungId: number, variante: ExportVariante, overwrite: boolean) => Promise<boolean>;
  /** aktueller Fortschritt, undefined = nicht aktiv */
  busy: string | undefined;
}

export function useExport(): IExportRun {
  const { exportEnv, settings, repo, openSettings } = useApp();
  const { notify, reload } = useData();
  const [busy, setBusy] = React.useState<string | undefined>();

  const run = React.useCallback(
    async (data: IAppData, rechnungId: number, variante: ExportVariante, overwrite: boolean): Promise<boolean> => {
      const input = buildExportInput(data, rechnungId, settings.ustSatz);
      if (!input) return false;
      setBusy('PDF wird erzeugt …');
      try {
        const res = await exportPdf(exportEnv, settings, input, variante, { overwrite, onProgress: setBusy });
        // Die Variante mit Kosten ist die Dokumentation der Rechnung → Link speichern
        if (variante === 'mitKosten' && input.rechnung.pdfUrl !== res.url) {
          await repo.setPdfLink(input.rechnung.id, res.url, res.name);
          await reload();
        }
        notify(res.existed ? 'Datei war bereits abgelegt' : 'Datei abgelegt', 'success', { text: res.name, url: res.url });
        if (res.warnings.length) notify(`Unbekannte Platzhalter in der Vorlage (leer ersetzt): ${res.warnings.join(', ')}`, 'warning');
        return true;
      } catch (e) {
        if (e instanceof ExportNotConfiguredError) {
          notify('Export nicht eingerichtet: Word-Vorlage und Export-Ordner fehlen.', 'warning', { text: 'Einstellungen öffnen', onClick: openSettings });
        } else {
          notify(`Export fehlgeschlagen: ${exportErrorText(e)}`, 'error');
        }
        return false;
      } finally {
        setBusy(undefined);
      }
    },
    [exportEnv, settings, repo, openSettings, notify, reload]
  );

  return { run, busy };
}
