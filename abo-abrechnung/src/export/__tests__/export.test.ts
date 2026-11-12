/// <reference types="node" />
import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import { huberLines, huberPositions } from '../../billing/__tests__/fixtures';
import { IKunde, IPositionItem, IRechnung, IRechnungsposition } from '../../data/mapping';
import { fillTemplate, textWidthTwips } from '../fillTemplate';
import { timelineSvg, wrapText } from '../timelineImage';
import { buildTemplateData, fileName, IExportInput, timelineXml } from '../templateData';

const kunde: IKunde = { id: 1, name: 'Bäckerei Huber GmbH', kundennummer: 'K-1001', adresse: 'Hauptstraße 12\n4020 Linz', aktiv: true };
const rechnung: IRechnung = { id: 9, nummer: '2027-001', kundeId: 1, rechnungsdatum: '2027-01-08', vorgaengerId: 4, status: 'Erstellt', summeNettoCent: 94230, pdfUrl: null };
const vorgaenger: IRechnung = { ...rechnung, id: 4, nummer: 'RE-2026-004', rechnungsdatum: '2026-01-12' };
const line = (id: number, positionId: number | null, title: string, von: string, bis: string, monateX100: number, menge: number, einzel: number, betrag: number): IRechnungsposition => ({
  id, rechnungId: 9, positionId, title, von, bis, monateX100, menge, einzelpreisCent: einzel, betragCent: betrag, art: positionId ? 'Folgezeitraum' : 'Einmalig'
});
const lines = [
  line(1, 1, 'Microsoft 365 Business Standard', '2027-01-01', '2027-12-31', 1200, 5, 15000, 75000),
  line(2, 2, 'Domain huber-baeckerei.at', '2027-03-15', '2028-03-14', 1200, 1, 2400, 2400),
  line(3, 4, 'Cloud-Backup 100 GB', '2026-08-01', '2027-12-31', 1700, 1, 11880, 16830)
];
const input: IExportInput = {
  rechnung,
  kunde,
  vorgaenger,
  lines,
  positionen: huberPositions.map((p): IPositionItem => ({ ...p, kundeId: 1 })),
  billedLines: huberLines.concat(lines.map((l) => ({ positionId: l.positionId, von: l.von, bis: l.bis, status: 'Erstellt' as const, rechnungId: 9, rechnungsnummer: '2027-001' }))),
  ustSatz: 20
};

function text(content: ArrayBuffer): string {
  const xml = new PizZip(content).file('word/document.xml')?.asText() || '';
  return xml.replace(/<w:br\/>/g, '\n').replace(/<[^>]+>/g, '');
}

const template = fs.readFileSync(path.join(__dirname, '../../../docs/Rechnungsvorlage-Beispiel.docx'));
const ab = template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength) as ArrayBuffer;

describe('Platzhalterdaten', () => {
  it('mit Kosten: formatierte Werte und Summen', () => {
    const d = buildTemplateData(input, 'mitKosten');
    expect(d).toMatchObject({
      titel: 'Leistungsaufstellung',
      rechnungsnummer: '2027-001',
      rechnungsdatum: '08.01.2027',
      vorgaenger: 'RE-2026-004 vom 12.01.2026',
      kundennummer: 'K-1001',
      mitKosten: true,
      summeNetto: '942,30 €',
      ustSatz: '20',
      ust: '188,46 €',
      summeBrutto: '1.130,76 €'
    });
    expect(d.positionen[0]).toEqual({
      bezeichnung: 'Microsoft 365 Business Standard', von: '01.01.2027', bis: '31.12.2027', monate: '12', menge: '5', einzelpreis: '150,00 €', betrag: '750,00 €', art: 'Folgezeitraum'
    });
  });

  it('Dateiname: "$"-Muster in Kundendaten werden nicht als Ersetzungsmuster interpretiert', () => {
    expect(fileName('', { rechnungsnummer: '1', kundennummer: 'K', kundenname: "Cash$'n Carry $&" })).toBe("1_K_Cash$'n Carry $-");
  });

  it('Dateiname ohne ungültige Zeichen', () => {
    expect(fileName('{rechnungsnummer}_{kundennummer}_{kundenname}', { rechnungsnummer: 'RE/2027:1', kundennummer: 'K-1', kundenname: 'Huber & Söhne' })).toBe('RE-2027-1_K-1_Huber - Söhne');
    expect(fileName('', { rechnungsnummer: '1', kundennummer: 'K', kundenname: 'X' }, '_Leistungsuebersicht')).toBe('1_K_X_Leistungsuebersicht');
  });

  it('Zeitleiste: Tabelle mit Jahren, Positionen und Markierung', () => {
    const xml = timelineXml(input);
    expect(xml).toContain('<w:tbl>');
    expect(xml).toContain('>2026<');
    expect(xml).toContain('>2027<');
    expect(xml).toContain('Domain huber-baeckerei.at');
    expect(xml).toContain('w:fill="2F6DB5"'); // diese Rechnung
    expect(xml).toContain('w:fill="C9DCF2"'); // andere Rechnungen
    expect(xml).toContain('C4262E'); // Rechnungsdatum
    expect(xml).toContain('Rechnungsdatum 08.01.2027');
  });
});

describe('Beispielvorlage befüllen', () => {
  it('mit Kosten: alle Werte, keine offenen Platzhalter', () => {
    const r = fillTemplate(ab, buildTemplateData(input, 'mitKosten'));
    const t = text(r.content);
    expect(r.warnings).toEqual([]);
    expect(t).toContain('Leistungsaufstellung');
    expect(t).toContain('zu Rechnung 2027-001 vom 08.01.2027');
    expect(t).not.toContain('Schließt an');
    expect(t).toContain('Hauptstraße 12');
    expect(t).toContain('750,00 €');
    expect(t).toContain('1.130,76 €');
    expect(t).toContain('Jahrespreis');
    expect(t).not.toMatch(/[{}]/);
  });

  it('ohne Kosten: Produkte und Zeitleiste, keine Beträge', () => {
    const r = fillTemplate(ab, buildTemplateData(input, 'ohneKosten'));
    const t = text(r.content);
    expect(t).toContain('Leistungsübersicht');
    expect(t).toContain('Cloud-Backup 100 GB');
    expect(t).toContain('Zeitleiste');
    expect(t).not.toContain('€');
    expect(t).not.toContain('Jahrespreis');
    expect(t).not.toMatch(/[{}]/);
  });

  it('unbekannter Platzhalter wird leer ersetzt und gemeldet', () => {
    const zip = new PizZip(ab);
    const xml = (zip.file('word/document.xml')?.asText() || '').replace('{titel}', '{titel} {gibtsNicht}');
    zip.file('word/document.xml', xml);
    const buf = zip.generate({ type: 'nodebuffer' }) as Buffer;
    const r = fillTemplate(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, buildTemplateData(input, 'mitKosten'));
    expect(r.warnings).toEqual(['gibtsNicht']);
  });

  it('Vorlage ohne Platzhalter (leeres Briefpapier) bricht mit klarer Meldung ab', () => {
    const zip = new PizZip(ab);
    const xml = zip.file('word/document.xml')?.asText() || '';
    zip.file('word/document.xml', xml.substring(0, xml.indexOf('<w:body>') + 8) + '<w:p/></w:body></w:document>');
    const buf = zip.generate({ type: 'nodebuffer' }) as Buffer;
    expect(() => fillTemplate(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, buildTemplateData(input, 'mitKosten'))).toThrow(
      /keine Platzhalter/
    );
  });

  it('Ergebnis enthält keine Ordner-Einträge (sonst scheitert die Online-PDF-Konvertierung)', () => {
    const out = new PizZip(fillTemplate(ab, buildTemplateData(input, 'mitKosten')).content);
    expect(Object.keys(out.files).filter((n) => out.files[n].dir)).toEqual([]);
  });

  it('Tabelleneigenschaften in Schema-Reihenfolge (tblBorders vor tblLayout)', () => {
    const xml = timelineXml(input);
    expect(xml.indexOf('<w:tblBorders>')).toBeLessThan(xml.indexOf('<w:tblLayout'));
  });
});

describe('Zeitleiste als Bild', () => {
  it('SVG mit Jahren, Bezeichnungen, Balken und Legende', () => {
    const res = timelineSvg(input);
    expect(res).not.toBeNull();
    const svg = (res as { svg: string }).svg;
    expect(svg).toContain('>2026<');
    expect(svg).toContain('>2027<');
    expect(svg).toContain('Microsoft 365 Business Standard');
    expect(svg).toContain('Rechnungsdatum 08.01.2027');
    expect(svg).toContain('#C4262E'); // Markierung
    expect(svg).toContain('#4A86C8'); // Balken dieser Rechnung
  });

  it('lange Bezeichnungen werden auf höchstens zwei Zeilen umgebrochen und gekürzt', () => {
    const measure = (t: string): number => t.length * 10;
    expect(wrapText('Microsoft Defender for Office 365 P1', 200, '', measure, 2)).toEqual(['Microsoft Defender', 'for Office 365 P1']);
    const lines = wrapText('sehr langer Name einer Position mit noch mehr Text dahinter', 200, '', measure, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1].length * 10).toBeLessThanOrEqual(200);
    expect(lines[1].endsWith('…')).toBe(true);
  });

  it('Textbreite aus den Seitenangaben der Vorlage', () => {
    expect(textWidthTwips('<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1134" w:bottom="1134" w:left="1417"/></w:sectPr>')).toBe(9355);
    expect(textWidthTwips('<w:body/>')).toBe(9026);
  });

  it('Bild ersetzt die Tabelle: PNG, Beziehung und Inhaltstyp im Paket', () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]).buffer;
    const out = new PizZip(fillTemplate(ab, buildTemplateData(input, 'mitKosten'), { png, width: 760, height: 300 }).content);
    const doc = out.file('word/document.xml')?.asText() || '';
    expect(doc).toContain('r:embed="rIdAaZeitleiste"');
    expect(doc).not.toContain('C4262E'); // keine Tabellen-Zeitleiste
    expect(out.file('word/media/aa_zeitleiste.png')).toBeTruthy();
    expect(out.file('word/_rels/document.xml.rels')?.asText()).toContain('Target="media/aa_zeitleiste.png"');
    expect(out.file('[Content_Types].xml')?.asText()).toMatch(/Extension="png"/i);
  });
});
