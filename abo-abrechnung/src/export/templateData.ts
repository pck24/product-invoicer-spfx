/** Daten für die Word-Vorlage (rein, ohne SharePoint). Alle Werte fertig formatiert. */
import { addDaysIso, addMonthsIso, formatDate, maxIso, minIso } from '../billing/dates';
import { formatAmount, formatEuro, formatMonate, totals } from '../billing/money';
import { isActiveLine } from '../billing/proposal';
import { IBilledLine, ISODate } from '../billing/types';
import { IKunde, IPositionItem, IRechnung, IRechnungsposition } from '../data/mapping';

export type ExportVariante = 'mitKosten' | 'ohneKosten';

export interface ITemplatePosition {
  bezeichnung: string;
  von: string;
  bis: string;
  monate: string;
  menge: string;
  einzelpreis: string;
  betrag: string;
  art: string;
}

export interface ITemplateData {
  titel: string;
  rechnungsnummer: string;
  rechnungsdatum: string;
  vorgaenger: string;
  kundenname: string;
  kundennummer: string;
  kundenadresse: string;
  mitKosten: boolean;
  positionen: ITemplatePosition[];
  summeNetto: string;
  ustSatz: string;
  ust: string;
  summeBrutto: string;
  /** Zeitleiste als WordprocessingML-Tabelle (Platzhalter {@zeitleiste}) */
  zeitleiste: string;
}

export interface IExportInput {
  rechnung: IRechnung;
  kunde: IKunde | undefined;
  vorgaenger: IRechnung | undefined;
  lines: IRechnungsposition[];
  positionen: IPositionItem[];
  /** alle verrechneten Zeiträume (für die Zeitleiste) */
  billedLines: IBilledLine[];
  ustSatz: number;
}

export const TITEL: { [k in ExportVariante]: string } = {
  mitKosten: 'Leistungsaufstellung',
  ohneKosten: 'Leistungsübersicht'
};

export function buildTemplateData(input: IExportInput, variante: ExportVariante): ITemplateData {
  const { rechnung, kunde, vorgaenger, lines } = input;
  const t = totals(lines.map((l) => l.betragCent), input.ustSatz);
  return {
    titel: TITEL[variante],
    rechnungsnummer: rechnung.nummer,
    rechnungsdatum: formatDate(rechnung.rechnungsdatum),
    vorgaenger: vorgaenger ? `${vorgaenger.nummer} vom ${formatDate(vorgaenger.rechnungsdatum)}` : '',
    kundenname: kunde ? kunde.name : '',
    kundennummer: kunde ? kunde.kundennummer : '',
    kundenadresse: kunde ? kunde.adresse : '',
    mitKosten: variante === 'mitKosten',
    positionen: lines.map((l) => ({
      bezeichnung: l.title,
      von: formatDate(l.von),
      bis: formatDate(l.bis),
      monate: l.positionId !== null ? formatMonate(l.monateX100) : '',
      menge: String(l.menge).replace('.', ','),
      einzelpreis: l.positionId !== null ? formatEuro(l.einzelpreisCent) : '',
      betrag: formatEuro(l.betragCent),
      art: l.art
    })),
    summeNetto: formatEuro(t.nettoCent),
    ustSatz: formatAmount(Math.round(input.ustSatz * 100)).replace(/,00$/, ''),
    ust: formatEuro(t.ustCent),
    summeBrutto: formatEuro(t.bruttoCent),
    zeitleiste: timelineXml(input)
  };
}

/** Dateiname aus Muster; ungültige Zeichen werden durch "-" ersetzt. */
export function fileName(pattern: string, data: { rechnungsnummer: string; kundennummer: string; kundenname: string }, suffix?: string): string {
  const base = (pattern || '{rechnungsnummer}_{kundennummer}_{kundenname}')
    .replace(/\{rechnungsnummer\}/g, data.rechnungsnummer)
    .replace(/\{kundennummer\}/g, data.kundennummer)
    .replace(/\{kundenname\}/g, data.kundenname);
  const clean = `${base}${suffix || ''}`
    .replace(/["*:<>?/\\|#%&{}~]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  return clean || 'Rechnung';
}

// ---------------------------------------------------------------------------
// Zeitleiste als Word-Tabelle
// ---------------------------------------------------------------------------

const TEXT_WIDTH = 9026; // A4 mit 2,54 cm Rändern
const LABEL_WIDTH = 2400;
const COLOR_CURRENT = '2F6DB5';
const COLOR_OTHER = 'C9DCF2';
const COLOR_GRID = 'D9D9D9';
const COLOR_MARKER = 'C4262E';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface ICell {
  start: ISODate;
  end: ISODate; // inklusiv
}

function run(text: string, opts: { bold?: boolean; color?: string; size?: number } = {}): string {
  const rPr = `<w:rPr>${opts.bold ? '<w:b/>' : ''}${opts.color ? `<w:color w:val="${opts.color}"/>` : ''}<w:sz w:val="${opts.size || 16}"/><w:szCs w:val="${opts.size || 16}"/></w:rPr>`;
  return `<w:r>${rPr}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function para(content: string, align?: 'left' | 'center' | 'right'): string {
  return `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="auto"/>${align ? `<w:jc w:val="${align}"/>` : ''}</w:pPr>${content}</w:p>`;
}

function cell(width: number, content: string, opts: { fill?: string; span?: number; left?: string; leftSize?: number; margins?: boolean } = {}): string {
  const borders = opts.left ? `<w:tcBorders><w:left w:val="single" w:sz="${opts.leftSize || 4}" w:space="0" w:color="${opts.left}"/></w:tcBorders>` : '';
  const shd = opts.fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.fill}"/>` : '';
  const mar = opts.margins === false ? '<w:tcMar><w:left w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar>' : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${opts.span && opts.span > 1 ? `<w:gridSpan w:val="${opts.span}"/>` : ''}${borders}${shd}${mar}<w:vAlign w:val="center"/></w:tcPr>${para(content)}</w:tc>`;
}

/**
 * Tabelle: erste Spalte Position, danach Monats- (bis 36 Monate) oder Quartalsspalten.
 * Zellen dieser Rechnung dunkelblau, andere Rechnungen hellblau, rote Linie beim Rechnungsdatum.
 */
export function timelineXml(input: IExportInput): string {
  const { rechnung, lines, positionen, billedLines } = input;
  const datum = rechnung.rechnungsdatum;
  const positionIds = lines.map((l) => l.positionId).filter((id, i, a): id is number => id !== null && a.indexOf(id) === i);
  if (positionIds.length === 0 || !datum) return para(run('Keine Zeiträume vorhanden.'));

  const rows = positionIds.map((pid) => {
    const pos = positionen.filter((p) => p.id === pid)[0];
    const bars = billedLines
      .filter((b) => b.positionId === pid && !!b.von && !!b.bis && (isActiveLine(b) || b.rechnungId === rechnung.id))
      .map((b) => ({ von: b.von as ISODate, bis: b.bis as ISODate, current: b.rechnungId === rechnung.id }));
    const title = pos ? pos.title : lines.filter((l) => l.positionId === pid)[0].title;
    return { title, ende: pos ? pos.ende : null, bars };
  });

  // Bereich: ganze Kalenderjahre, höchstens 5, endend mit dem spätesten Datum
  let min: ISODate = datum;
  let max: ISODate = datum;
  for (const r of rows) {
    for (const b of r.bars) {
      min = minIso(min, b.von);
      max = maxIso(max, b.bis);
    }
  }
  const endYear = Number(max.substring(0, 4));
  const startYear = Math.max(Number(min.substring(0, 4)), endYear - 4);
  const months = (endYear - startYear + 1) * 12;
  const step = months <= 36 ? 1 : 3;
  const cells: ICell[] = [];
  for (let m = 0; m < months; m += step) {
    const start = addMonthsIso(`${startYear}-01-01`, m);
    cells.push({ start, end: addDaysIso(addMonthsIso(start, step), -1) });
  }
  const colWidth = Math.floor((TEXT_WIDTH - LABEL_WIDTH) / cells.length);
  const widths = cells.map((_, i) => (i === cells.length - 1 ? TEXT_WIDTH - LABEL_WIDTH - colWidth * (cells.length - 1) : colWidth));
  const perYear = 12 / step;
  const markerIdx = cells.map((c) => datum >= c.start && datum <= c.end).indexOf(true);

  const grid = `<w:tblGrid><w:gridCol w:w="${LABEL_WIDTH}"/>${widths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const tblPr =
    `<w:tblPr><w:tblW w:w="${TEXT_WIDTH}" w:type="dxa"/><w:tblLayout w:type="fixed"/>` +
    `<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="${COLOR_GRID}"/><w:right w:val="nil"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="FFFFFF"/><w:insideV w:val="nil"/></w:tblBorders>` +
    `<w:tblCellMar><w:top w:w="20" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="20" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr>`;

  // Kopfzeile mit Jahren
  let head = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${cell(LABEL_WIDTH, run('Position', { bold: true }))}`;
  for (let y = 0; y < endYear - startYear + 1; y++) {
    const w = widths.slice(y * perYear, (y + 1) * perYear).reduce((a, b) => a + b, 0);
    head += cell(w, run(String(startYear + y), { bold: true, color: '616161' }), { span: perYear, left: COLOR_GRID });
  }
  head += '</w:tr>';

  const body = rows
    .map((r) => {
      let tr = `<w:tr><w:trPr><w:trHeight w:val="300" w:hRule="atLeast"/></w:trPr>${cell(LABEL_WIDTH, run(r.title))}`;
      cells.forEach((c, i) => {
        const hit = (cur: boolean): boolean => r.bars.some((b) => b.current === cur && b.von <= c.end && b.bis >= c.start);
        const fill = hit(true) ? COLOR_CURRENT : hit(false) ? COLOR_OTHER : undefined;
        const yearStart = i % perYear === 0;
        const marker = i === markerIdx;
        const cancelled = !!r.ende && r.ende >= c.start && r.ende <= c.end;
        tr += cell(widths[i], cancelled ? run('|', { color: '616161', size: 14 }) : '', {
          fill,
          left: marker ? COLOR_MARKER : yearStart ? COLOR_GRID : undefined,
          leftSize: marker ? 12 : 4,
          margins: false
        });
      });
      return `${tr}</w:tr>`;
    })
    .join('');

  const legend = para(
    run('■ ', { color: COLOR_CURRENT, size: 18 }) +
      run('diese Rechnung    ') +
      run('■ ', { color: COLOR_OTHER, size: 18 }) +
      run('andere Rechnungen    ') +
      run('| ', { color: COLOR_MARKER, bold: true }) +
      run(`Rechnungsdatum ${formatDate(datum)}`) +
      (rows.some((r) => !!r.ende) ? run('    | ', { color: '616161' }) + run('Kündigung') : '')
  );
  // Abstand vor der Legende
  const spacer = '<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>';
  return `<w:tbl>${tblPr}${grid}${head}${body}</w:tbl>${spacer}${legend}`;
}
