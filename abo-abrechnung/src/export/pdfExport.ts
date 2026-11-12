import { SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/files';
import '@pnp/sp/folders';
import type { MSGraphClientV3 } from '@microsoft/sp-http';
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
  /** 'pdf' (Standard, über Graph umgewandelt) oder 'docx' (befülltes Word-Dokument, ohne Graph) */
  ausgabeformat?: 'pdf' | 'docx';
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

/** Microsoft Graph verweigert den Zugriff (meist fehlt die API-Freigabe "Sites.ReadWrite.All"). */
export class GraphAccessError extends Error {
  public constructor(cause: unknown) {
    super(`Kein Zugriff auf Microsoft Graph: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'GraphAccessError';
    Object.setPrototypeOf(this, GraphAccessError.prototype);
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function isAccessDenied(e: any): boolean {
  const status = e && (e.statusCode || e.status);
  return status === 401 || status === 403;
}

/** Site-Id je Site (ändert sich nie) – spart eine Graph-Abfrage je Export. */
const siteIds: { [key: string]: Promise<string> } = {};

function siteId(graph: MSGraphClientV3, env: IExportEnv): Promise<string> {
  const key = `${env.siteHost}:${env.siteServerRelativeUrl}`;
  if (!siteIds[key]) {
    siteIds[key] = graph
      .api(`/sites/${env.siteHost}:${env.siteServerRelativeUrl || '/'}`)
      .select('id')
      .get()
      .then((s: any) => s.id as string)
      .catch((e: unknown) => {
        delete siteIds[key];
        throw e;
      });
  }
  return siteIds[key];
}

/** Wandelt eine hochgeladene .docx über Microsoft Graph in ein PDF um. */
async function convertToPdf(env: IExportEnv, docxServerRelativeUrl: string): Promise<Blob> {
  const itemQuery = env.sp.web.getFileByServerRelativePath(docxServerRelativeUrl).listItemAllFields.select('Id', 'ParentList/Id').expand('ParentList');
  try {
    // Listenelement (SharePoint) und Site (Graph) unabhängig voneinander ermitteln
    const [item, graph] = await Promise.all([itemQuery() as Promise<any>, env.getGraph()]);
    const id = await siteId(graph, env);
    const driveItem: any = await graph.api(`/sites/${id}/lists/${item.ParentList.Id}/items/${item.Id}/driveItem`).select('id,parentReference').get();
    return await graph
      .api(`/drives/${driveItem.parentReference.driveId}/items/${driveItem.id}/content?format=pdf`)
      .responseType('blob' as any)
      .get();
  } catch (e) {
    throw isAccessDenied(e) ? new GraphAccessError(e) : e;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
  const asDocx = config.ausgabeformat === 'docx';
  const pdfName = `${name}.${asDocx ? 'docx' : 'pdf'}`;
  const pdfUrl = `${folderUrl}/${pdfName}`;
  const absolute = (serverRelative: string): string => `https://${env.siteHost}${encodeURI(serverRelative)}`;

  if (!options.overwrite && (await sp.web.getFileByServerRelativePath(pdfUrl).exists())) {
    return { url: absolute(pdfUrl), name: pdfName, warnings: [], existed: true };
  }

  progress('Vorlage wird geladen …');
  // Word-Bibliotheken (docxtemplater, pizzip) erst beim Export nachladen, nicht beim Seitenaufbau
  const [template, { fillTemplate }] = await Promise.all([
    sp.web.getFileByServerRelativePath(trimSlash(config.vorlageUrl as string)).getBuffer(),
    import(/* webpackChunkName: 'abo-abrechnung-docx' */ './fillTemplate')
  ]);

  progress('Vorlage wird befüllt …');
  const filled = fillTemplate(template, buildTemplateData(input, variante));

  const folder = sp.web.getFolderByServerRelativePath(folderUrl);
  if (asDocx) {
    // Word-Ausgabe: befülltes Dokument direkt ablegen, keine Konvertierung
    progress('Dokument wird abgelegt …');
    const saved = await folder.files.addUsingPath(pdfName, filled.content, { Overwrite: options.overwrite });
    return { url: absolute(saved.ServerRelativeUrl), name: pdfName, warnings: filled.warnings, existed: false };
  }
  const tmpName = `_tmp_${name}.docx`;
  progress('Dokument wird hochgeladen …');
  const tmp = await folder.files.addUsingPath(tmpName, filled.content, { Overwrite: true });
  const tmpUrl = tmp.ServerRelativeUrl;
  try {
    progress('PDF wird erzeugt …');
    const pdf = await convertToPdf(env, tmpUrl);
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
