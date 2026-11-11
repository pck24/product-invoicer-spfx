import { SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/files';
import '@pnp/sp/folders';
import type { MSGraphClientV3 } from '@microsoft/sp-http';
import { fillTemplate } from './fillTemplate';
import { buildTemplateData, ExportVariante, fileName, IExportInput } from './templateData';

export interface IExportEnv {
  sp: SPFI;
  getGraph: () => Promise<MSGraphClientV3>;
  /** z. B. justelevate.sharepoint.com */
  siteHost: string;
  /** serverrelative URL der Site, z. B. /sites/JustElevate-Kunden */
  siteServerRelativeUrl: string;
}

export interface IExportConfig {
  vorlageUrl?: string;
  exportOrdner?: string;
  dateinamenMuster: string;
}

export interface IExportResult {
  url: string;
  name: string;
  warnings: string[];
  /** Datei existierte bereits und wurde nicht überschrieben */
  existed: boolean;
}

/** Vorlage oder Export-Ordner fehlen im Property Pane. */
export class ExportNotConfiguredError extends Error {
  public constructor() {
    super('Für den PDF-Export fehlen Word-Vorlage oder Export-Ordner in den Webpart-Einstellungen.');
    this.name = 'ExportNotConfiguredError';
    Object.setPrototypeOf(this, ExportNotConfiguredError.prototype);
  }
}

export function isConfigured(config: IExportConfig): boolean {
  return !!(config.vorlageUrl && config.vorlageUrl.trim() && config.exportOrdner && config.exportOrdner.trim());
}

function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/**
 * Erzeugt das PDF einer Rechnung:
 * Vorlage laden → befüllen → als _tmp_….docx hochladen → über Graph als PDF abrufen
 * → PDF ablegen → temporäre Datei löschen.
 */
export async function exportPdf(
  env: IExportEnv,
  config: IExportConfig,
  input: IExportInput,
  variante: ExportVariante,
  options: { overwrite: boolean; onProgress?: (step: string) => void }
): Promise<IExportResult> {
  if (!isConfigured(config)) throw new ExportNotConfiguredError();
  const progress = options.onProgress || (() => undefined);
  const { sp } = env;
  const folderUrl = trimSlash(config.exportOrdner as string);
  const name = fileName(
    config.dateinamenMuster,
    {
      rechnungsnummer: input.rechnung.nummer,
      kundennummer: input.kunde ? input.kunde.kundennummer : '',
      kundenname: input.kunde ? input.kunde.name : ''
    },
    variante === 'ohneKosten' ? '_Leistungsuebersicht' : ''
  );
  const pdfName = `${name}.pdf`;
  const pdfUrl = `${folderUrl}/${pdfName}`;
  const absolute = (serverRelative: string): string => `https://${env.siteHost}${encodeURI(serverRelative)}`;

  if (!options.overwrite && (await sp.web.getFileByServerRelativePath(pdfUrl).exists())) {
    return { url: absolute(pdfUrl), name: pdfName, warnings: [], existed: true };
  }

  progress('Vorlage wird geladen …');
  const template = await sp.web.getFileByServerRelativePath(trimSlash(config.vorlageUrl as string)).getBuffer();

  progress('Vorlage wird befüllt …');
  const filled = fillTemplate(template, buildTemplateData(input, variante));

  const folder = sp.web.getFolderByServerRelativePath(folderUrl);
  const tmpName = `_tmp_${name}.docx`;
  progress('Dokument wird hochgeladen …');
  const tmp = await folder.files.addUsingPath(tmpName, filled.content, { Overwrite: true });
  const tmpUrl = tmp.ServerRelativeUrl;
  try {
    progress('PDF wird erzeugt …');
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const item: any = await sp.web.getFileByServerRelativePath(tmpUrl).listItemAllFields.select('Id', 'ParentList/Id').expand('ParentList')();
    const graph = await env.getGraph();
    const site: any = await graph.api(`/sites/${env.siteHost}:${env.siteServerRelativeUrl || '/'}`).select('id').get();
    const driveItem: any = await graph.api(`/sites/${site.id}/lists/${item.ParentList.Id}/items/${item.Id}/driveItem`).select('id,parentReference').get();
    const pdf: Blob = await graph
      .api(`/drives/${driveItem.parentReference.driveId}/items/${driveItem.id}/content?format=pdf`)
      .responseType('blob' as any)
      .get();
    /* eslint-enable @typescript-eslint/no-explicit-any */

    progress('PDF wird abgelegt …');
    const saved = await folder.files.addUsingPath(pdfName, pdf, { Overwrite: options.overwrite });
    return { url: absolute(saved.ServerRelativeUrl), name: pdfName, warnings: filled.warnings, existed: false };
  } finally {
    // temporäre .docx immer entfernen
    try {
      await sp.web.getFileByServerRelativePath(tmpUrl).delete();
    } catch {
      // ignorieren; Fehler beim Export selbst ist wichtiger
    }
  }
}
