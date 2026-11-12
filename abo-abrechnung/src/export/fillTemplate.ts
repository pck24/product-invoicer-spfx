import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { ITemplateData } from './templateData';
import { ITimelineImage } from './timelineImage';

export interface IFillResult {
  content: ArrayBuffer;
  /** unbekannte Platzhalter (leer ersetzt) */
  warnings: string[];
}

/**
 * Befüllt eine Word-Vorlage (Begrenzer { }). Unbekannte Platzhalter werden leer
 * ersetzt und als Warnung gemeldet; Syntaxfehler der Vorlage werfen eine lesbare Meldung.
 * Mit zeitleisteBild ersetzt das Bild die Tabelle an {@zeitleiste}.
 */
export function fillTemplate(template: ArrayBuffer, data: ITemplateData, zeitleisteBild?: ITimelineImage): IFillResult {
  const warnings: string[] = [];
  const source = new PizZip(template);
  const bodyFile = source.file('word/document.xml');
  if (!bodyFile || bodyFile.asText().indexOf('{') < 0) {
    throw new Error(
      'Die gewählte Word-Vorlage enthält keine Platzhalter (z. B. {rechnungsnummer}). Bitte im Webpart die Rechnungsvorlage statt des leeren Briefpapiers eintragen.'
    );
  }
  if (zeitleisteBild) data = { ...data, zeitleiste: embedImage(source, zeitleisteBild) };
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

const IMAGE_REL_ID = 'rIdAaZeitleiste';
const IMAGE_PATH = 'media/aa_zeitleiste.png';
/** Textbreite A4 mit 2,54 cm Rändern, falls die Vorlage keine Seitenangaben hat */
const DEFAULT_TEXT_TWIPS = 9026;

/** Textbreite der (letzten) Seite in Twips aus pgSz/pgMar der Vorlage. */
export function textWidthTwips(documentXml: string): number {
  const last = (all: RegExpMatchArray | null): string => (all ? all[all.length - 1] : '');
  const pgSz = last(documentXml.match(/<w:pgSz\s[^>]*>/g));
  const pgMar = last(documentXml.match(/<w:pgMar\s[^>]*>/g));
  const num = (m: RegExpExecArray | null): number | undefined => (m ? Number(m[1]) : undefined);
  const page = num(/\sw:w="(\d+)"/.exec(pgSz));
  const left = num(/\sw:left="(\d+)"/.exec(pgMar));
  const right = num(/\sw:right="(\d+)"/.exec(pgMar));
  if (page === undefined || left === undefined || right === undefined) return DEFAULT_TEXT_TWIPS;
  const w = page - left - right;
  return w > 1000 ? w : DEFAULT_TEXT_TWIPS;
}

/** Legt das PNG ins Paket (Datei, Beziehung, Inhaltstyp) und liefert den Absatz mit dem Bild in voller Textbreite. */
function embedImage(zip: PizZip, img: ITimelineImage): string {
  zip.file(`word/${IMAGE_PATH}`, img.png);
  const relsName = 'word/_rels/document.xml.rels';
  const rels = zip.file(relsName);
  if (!rels) throw new Error('Die Word-Vorlage ist fehlerhaft: Beziehungen fehlen.');
  const relsXml = rels.asText();
  if (relsXml.indexOf(`Id="${IMAGE_REL_ID}"`) < 0) {
    zip.file(
      relsName,
      relsXml.replace(
        '</Relationships>',
        `<Relationship Id="${IMAGE_REL_ID}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${IMAGE_PATH}"/></Relationships>`
      )
    );
  }
  const typesName = '[Content_Types].xml';
  const types = zip.file(typesName);
  if (types && !/Extension="png"/i.test(types.asText())) {
    zip.file(typesName, types.asText().replace(/(<Types[^>]*>)/, '$1<Default Extension="png" ContentType="image/png"/>'));
  }
  const body = zip.file('word/document.xml');
  const cx = textWidthTwips(body ? body.asText() : '') * 635; // 1 Twip = 635 EMU
  const cy = Math.round((cx * img.height) / img.width);
  // Namensräume lokal deklariert: unabhängig davon, was die Vorlage im Wurzelelement angibt
  return (
    '<w:p><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="0"/><w:jc w:val="left"/></w:pPr><w:r><w:drawing>' +
    `<wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="4711" name="Zeitleiste"/>` +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
    '<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="4711" name="zeitleiste.png"/><pic:cNvPicPr/></pic:nvPicPr>' +
    `<pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${IMAGE_REL_ID}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    '</a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
  );
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
