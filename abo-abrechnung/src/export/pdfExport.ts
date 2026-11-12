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
  /** 'pdf' (Standard, über Graph umgewandelt) oder 'docx' (befülltes Word-Dokument, ohne Graph) */
  ausgabeformat?: 'pdf' | 'docx';
}

export interface IExportResult {
  url: string;
  name: string;
  warnings: string[];
  /** Datei existierte bereits und wurde nicht überschrieben */
  existed: boolean;
  /** PDF-Umwandlung fehlgeschlagen → stattdessen wurde die Word-Datei abgelegt (Grund) */
  pdfFehler?: string;
  /** der Fehler war ein fehlender Graph-Zugriff (API-Freigabe) */
  pdfFehlerZugriff?: boolean;
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

/** Bricht ab, wenn ein Schritt nicht innerhalb von ms antwortet (sonst hängt der Export endlos). */
function withTimeout<T>(promise: Promise<T>, ms: number, schritt: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`„${schritt}“ hat nach ${Math.round(ms / 1000)} s nicht geantwortet.`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/** Führt einen Schritt mit Zeitlimit aus und protokolliert Dauer bzw. Fehler in der Browser-Konsole. */
async function schritt<T>(name: string, ms: number, run: () => Promise<T>): Promise<T> {
  const start = Date.now();
  console.info(`[Abo-Abrechnung] ${name} …`);
  try {
    const result = await withTimeout(run(), ms, name);
    console.info(`[Abo-Abrechnung] ${name}: ok (${Date.now() - start} ms)`);
    return result;
  } catch (e) {
    console.warn(`[Abo-Abrechnung] ${name}: Fehler nach ${Date.now() - start} ms`, e);
    throw e;
  }
}

/** Wandelt eine hochgeladene .docx über Microsoft Graph in ein PDF um. */
async function convertToPdf(env: IExportEnv, docxServerRelativeUrl: string): Promise<Blob> {
  try {
    // Listenelement (SharePoint) und Graph-Client unabhängig voneinander ermitteln
    const [item, graph] = await Promise.all([
      schritt('Listenelement der Word-Datei lesen', 30000, () =>
        env.sp.web.getFileByServerRelativePath(docxServerRelativeUrl).listItemAllFields.select('Id', 'ParentList/Id').expand('ParentList')() as Promise<any>
      ),
      schritt('Graph-Client (Anmeldung)', 30000, () => env.getGraph())
    ]);
    const id = await schritt('Graph: Site ermitteln', 30000, () => siteId(graph, env));
    const driveItem: any = await schritt('Graph: Datei ermitteln', 30000, () =>
      graph.api(`/sites/${id}/lists/${item.ParentList.Id}/items/${item.Id}/driveItem`).select('id,parentReference').get()
    );
    return await schritt('Graph: PDF-Umwandlung', 120000, () =>
      graph
        .api(`/drives/${driveItem.parentReference.driveId}/items/${driveItem.id}/content?format=pdf`)
        .responseType('blob' as any)
        .get()
    );
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
  // Word-Bibliotheken bewusst statisch gebündelt: Nachladen (Chunk) kann fehlschlagen und spart hier kaum etwas
  const template = await sp.web.getFileByServerRelativePath(trimSlash(config.vorlageUrl as string)).getBuffer();

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
    let pdf: Blob;
    try {
      pdf = await convertToPdf(env, tmpUrl);
    } catch (e) {
      // Umwandlung fehlgeschlagen: stattdessen die fertige Word-Datei ablegen, damit es in jedem Fall ein Dokument gibt
      progress('Word-Datei wird abgelegt …');
      const docxName = `${name}.docx`;
      const saved = await folder.files.addUsingPath(docxName, filled.content, { Overwrite: true });
      return {
        url: absolute(saved.ServerRelativeUrl),
        name: docxName,
        warnings: filled.warnings,
        existed: false,
        pdfFehler: e instanceof Error ? e.message : String(e),
        pdfFehlerZugriff: e instanceof GraphAccessError
      };
    }
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
