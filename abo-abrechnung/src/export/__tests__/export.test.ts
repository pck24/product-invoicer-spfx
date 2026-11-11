/// <reference types="node" />
import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import { huberLines, huberPositions } from '../../billing/__tests__/fixtures';
import { IKunde, IPositionItem, IRechnung, IRechnungsposition } from '../../data/mapping';
import { fillTemplate } from '../fillTemplate';
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
    expect(t).toContain('Schließt an Rechnung RE-2026-004 vom 12.01.2026 an.');
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

  it('ohne Vorgänger entfällt der Hinweis', () => {
    const t = text(fillTemplate(ab, buildTemplateData({ ...input, vorgaenger: undefined }, 'mitKosten')).content);
    expect(t).not.toContain('Schließt an');
  });
});
