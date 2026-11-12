/**
 * Zeitleiste als Bild für Word/PDF – gleiche Optik wie in der App
 * (Bezeichnung links, abgerundete Balken auf einer Spur, rote Linie beim Rechnungsdatum).
 *
 * timelineSvg ist rein (testbar); renderTimelinePng zeichnet im Browser über ein Canvas.
 */
import { addDaysIso, diffDays, formatDate } from '../billing/dates';
import { ISODate } from '../billing/types';
import { escapeXml } from '../data/lists';
import { IExportInput } from './templateData';
import { timelineRange, timelineRows } from './timelineModel';

/** Breite eines Textes in px für eine CSS-Schriftangabe. */
export type Measure = (text: string, font: string) => number;

export interface ITimelineSvg {
  svg: string;
  /** logische Größe in px (Seitenverhältnis des Bildes) */
  width: number;
  height: number;
}

export interface ITimelineImage {
  png: ArrayBuffer;
  width: number;
  height: number;
}

// Bildbreite 760 px ≙ Textbreite der Seite (~16 cm) → 15 px ≈ 9 pt
const W = 760;
const LABEL_W = 300;
const GAP = 16;
const TRACK_X = LABEL_W + GAP;
const TRACK_W = W - TRACK_X;
const HEAD_H = 22;
const LINE_H = 19;
const ROW_GAP = 6;
const FAMILY = "'Segoe UI', Calibri, Arial, sans-serif";
const FONT_LABEL = `600 15px ${FAMILY}`;
const FONT_SMALL = `400 13px ${FAMILY}`;

const C = {
  text: '#242424',
  muted: '#707070',
  grid: '#E0E0E0',
  track: '#F3F3F3',
  current: '#4A86C8',
  other: '#D6E4F5',
  otherStroke: '#A9C5E8',
  marker: '#C4262E',
  cancel: '#8A8A8A'
};

/** Grobe Textbreite ohne Browser (Tests); im Browser wird mit dem Canvas gemessen. */
export const approxMeasure: Measure = (text, font) => {
  const size = Number((/(\d+)px/.exec(font) || ['', '15'])[1]);
  return text.length * size * (font.indexOf('600') === 0 ? 0.56 : 0.52);
};

/** Bricht Text in höchstens maxLines Zeilen um; Überlänge endet mit "…". */
export function wrapText(text: string, maxWidth: number, font: string, measure: Measure, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < words.length; i++) {
    const candidate = current ? `${current} ${words[i]}` : words[i];
    if (measure(candidate, font) <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    if (lines.length === maxLines - 1) {
      current = `${current} ${words.slice(i).join(' ')}`;
      break;
    }
    lines.push(current);
    current = words[i];
  }
  lines.push(current);
  // letzte Zeile (und einzelne überlange Wörter) kürzen
  return lines.map((l) => {
    if (measure(l, font) <= maxWidth) return l;
    let s = l;
    while (s.length > 1 && measure(`${s}…`, font) > maxWidth) s = s.substring(0, s.length - 1);
    return `${s.replace(/\s+$/, '')}…`;
  });
}

function rect(x: number, y: number, w: number, h: number, attrs: string): string {
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(w, 0).toFixed(1)}" height="${h.toFixed(1)}" ${attrs}/>`;
}

function line(x1: number, y1: number, x2: number, y2: number, color: string, width: number): string {
  return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${color}" stroke-width="${width}"/>`;
}

function text(x: number, y: number, content: string, font: 'label' | 'small', color: string): string {
  const f = font === 'label' ? 'font-size="15" font-weight="600"' : 'font-size="13"';
  return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-family="${escapeXml(FAMILY)}" ${f} fill="${color}">${escapeXml(content)}</text>`;
}

export function timelineSvg(input: IExportInput, measure: Measure = approxMeasure): ITimelineSvg | null {
  const datum = input.rechnung.rechnungsdatum;
  const rows = timelineRows(input.rechnung, input.lines, input.positionen, input.billedLines);
  if (rows.length === 0 || !datum) return null;

  const { startYear, endYear } = timelineRange(rows, datum);
  const rangeStart = `${startYear}-01-01`;
  const rangeEnd = `${endYear + 1}-01-01`;
  const total = diffDays(rangeStart, rangeEnd);
  const x = (d: ISODate): number => TRACK_X + Math.max(0, Math.min(1, diffDays(rangeStart, d) / total)) * TRACK_W;

  const body: string[] = [];
  let y = HEAD_H + 4;
  for (const r of rows) {
    const labelLines = wrapText(r.title, LABEL_W, FONT_LABEL, measure, 2);
    const h = labelLines.length > 1 ? 44 : 30;
    const mid = y + h / 2;
    const first = mid - ((labelLines.length - 1) * LINE_H) / 2 + 5;
    labelLines.forEach((l, i) => body.push(text(0, first + i * LINE_H, l, 'label', C.text)));
    body.push(rect(TRACK_X, mid - 11, TRACK_W, 22, `rx="4" fill="${C.track}"`));
    for (const b of r.bars) {
      if (b.bis < rangeStart || b.von >= rangeEnd) continue;
      const bx = x(b.von);
      const bw = Math.max(x(addDaysIso(b.bis, 1)) - bx - 1.5, 2);
      body.push(
        rect(bx, mid - 8, bw, 16, b.current ? `rx="3" fill="${C.current}"` : `rx="3" fill="${C.other}" stroke="${C.otherStroke}" stroke-width="1"`)
      );
    }
    if (r.ende && r.ende >= rangeStart && r.ende < rangeEnd) {
      const cx = x(addDaysIso(r.ende, 1));
      body.push(line(cx, mid - 11, cx, mid + 11, C.cancel, 2));
    }
    y += h + ROW_GAP;
  }
  const bottom = y - ROW_GAP;

  // Jahresraster (unter den Spuren) und Kopf
  const grid: string[] = [];
  for (let yr = startYear; yr <= endYear; yr++) {
    const gx = x(`${yr}-01-01`);
    grid.push(line(gx, 0, gx, bottom, C.grid, 1));
    grid.push(text(gx + 5, 15, String(yr), 'small', C.muted));
  }
  const mx = x(datum);
  const marker = line(mx, HEAD_H, mx, bottom + 2, C.marker, 2);

  // Legende
  const legend: string[] = [];
  const ly = bottom + 22;
  let lx = 0;
  const item = (swatch: string, label: string): void => {
    legend.push(swatch);
    legend.push(text(lx + 22, ly + 4, label, 'small', C.muted));
    lx += 22 + measure(label, FONT_SMALL) + 20;
  };
  const kinds = { current: false, other: false };
  for (const r of rows) for (const b of r.bars) kinds[b.current ? 'current' : 'other'] = true;
  if (kinds.current) item(rect(lx, ly - 5, 16, 9, `rx="2" fill="${C.current}"`), 'diese Rechnung');
  if (kinds.other) item(rect(lx, ly - 5, 16, 9, `rx="2" fill="${C.other}" stroke="${C.otherStroke}" stroke-width="1"`), 'andere Rechnungen');
  if (rows.some((r) => !!r.ende)) item(line(lx + 8, ly - 7, lx + 8, ly + 6, C.cancel, 2), 'Kündigung');
  item(line(lx + 8, ly - 7, lx + 8, ly + 6, C.marker, 2), `Rechnungsdatum ${formatDate(datum)}`);

  const height = Math.ceil(ly + 12);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}">` +
    grid.join('') +
    body.join('') +
    marker +
    legend.join('') +
    '</svg>';
  return { svg, width: W, height };
}

/** Zeichnet die Zeitleiste im Browser als PNG (scale-fache Auflösung für scharfen Druck). */
export async function renderTimelinePng(input: IExportInput, scale = 4): Promise<ITimelineImage | null> {
  // Messen mit einem eigenen Canvas, gezeichnet wird erst nach dem Laden des Bildes
  const measureCtx = document.createElement('canvas').getContext('2d');
  if (!measureCtx) return null;
  const measure: Measure = (t, font) => {
    measureCtx.font = font;
    return measureCtx.measureText(t).width;
  };
  const res = timelineSvg(input, measure);
  if (!res) return null;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Zeitleiste konnte nicht gezeichnet werden.'));
    el.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(res.svg)}`;
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(res.width * scale);
  canvas.height = Math.round(res.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) return null;
  return { png: await blob.arrayBuffer(), width: res.width, height: res.height };
}
