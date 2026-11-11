import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { ITemplateData } from './templateData';

export interface IFillResult {
  content: ArrayBuffer;
  /** unbekannte Platzhalter (leer ersetzt) */
  warnings: string[];
}

/**
 * Befüllt eine Word-Vorlage (Begrenzer { }). Unbekannte Platzhalter werden leer
 * ersetzt und als Warnung gemeldet; Syntaxfehler der Vorlage werfen eine lesbare Meldung.
 */
export function fillTemplate(template: ArrayBuffer, data: ITemplateData): IFillResult {
  const warnings: string[] = [];
  const source = new PizZip(template);
  const bodyFile = source.file('word/document.xml');
  if (!bodyFile || bodyFile.asText().indexOf('{') < 0) {
    throw new Error(
      'Die gewählte Word-Vorlage enthält keine Platzhalter (z. B. {rechnungsnummer}). Bitte im Webpart die Rechnungsvorlage statt des leeren Briefpapiers eintragen.'
    );
  }
  let doc: Docxtemplater;
  try {
    doc = new Docxtemplater(source, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{', end: '}' },
      nullGetter: (part: { module?: string; value?: string; raw?: string }) => {
        if (!part.module) {
          const name = part.value || part.raw || '?';
          if (warnings.indexOf(name) < 0) warnings.push(name);
        }
        return '';
      }
    });
    doc.render(data);
  } catch (e) {
    throw new Error(`Die Word-Vorlage ist fehlerhaft: ${describe(e)}`);
  }
  const zip = doc.getZip();
  // Ordner-Einträge entfernen (z. B. aus in Word/SharePoint gespeicherten Vorlagen):
  // Pakete mit Ordner-Einträgen werden von der Online-Konvertierung (Graph-PDF) nicht korrekt geöffnet.
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) delete zip.files[name];
  }
  const content = zip.generate({ type: 'arraybuffer', compression: 'DEFLATE' }) as ArrayBuffer;
  return { content, warnings };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function describe(e: any): string {
  const errors = e && e.properties && e.properties.errors;
  if (Array.isArray(errors) && errors.length) {
    return errors
      .map((x: any) => (x.properties && (x.properties.explanation || x.properties.id)) || x.message)
      .slice(0, 5)
      .join('; ');
  }
  return e instanceof Error ? e.message : String(e);
}
