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
const LABEL_W = 400;
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

/** Grundformen der Grafik: daraus entstehen SVG (Tests) und Canvas-Zeichnung (Export). */
export type Shape =
  | { k: 'rect'; x: number; y: number; w: number; h: number; r: number; fill: string; stroke?: string }
  | { k: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
  | { k: 'text'; x: number; y: number; text: string; font: 'label' | 'small'; color: string };

export interface ITimelineShapes {
  shapes: Shape[];
  width: number;
  height: number;
}

const FONTS = { label: FONT_LABEL, small: FONT_SMALL };

export function timelineShapes(input: IExportInput, measure: Measure = approxMeasure): ITimelineShapes | null {
  const datum = input.rechnung.rechnungsdatum;
  const rows = timelineRows(input.rechnung, input.lines, input.positionen, input.billedLines);
  if (rows.length === 0 || !datum) return null;

  const { startYear, endYear } = timelineRange(rows, datum);
  const rangeStart = `${startYear}-01-01`;
  const rangeEnd = `${endYear + 1}-01-01`;
  const total = diffDays(rangeStart, rangeEnd);
  const x = (d: ISODate): number => TRACK_X + Math.max(0, Math.min(1, diffDays(rangeStart, d) / total)) * TRACK_W;
  const line = (x1: number, y1: number, x2: number, y2: number, color: string, width: number): Shape => ({ k: 'line', x1, y1, x2, y2, color, width });
  const text = (tx: number, ty: number, t: string, font: 'label' | 'small', color: string): Shape => ({ k: 'text', x: tx, y: ty, text: t, font, color });

  const body: Shape[] = [];
  let y = HEAD_H + 4;
  for (const r of rows) {
    const labelLines = wrapText(r.title, LABEL_W, FONT_LABEL, measure, 2);
    const h = labelLines.length > 1 ? 44 : 30;
    const mid = y + h / 2;
    const first = mid - ((labelLines.length - 1) * LINE_H) / 2 + 5;
    labelLines.forEach((l, i) => body.push(text(0, first + i * LINE_H, l, 'label', C.text)));
    body.push({ k: 'rect', x: TRACK_X, y: mid - 11, w: TRACK_W, h: 22, r: 4, fill: C.track });
    for (const b of r.bars) {
      if (b.bis < rangeStart || b.von >= rangeEnd) continue;
      const bx = x(b.von);
      const bw = Math.max(x(addDaysIso(b.bis, 1)) - bx - 1.5, 2);
      body.push(
        b.current
          ? { k: 'rect', x: bx, y: mid - 8, w: bw, h: 16, r: 3, fill: C.current }
          : { k: 'rect', x: bx, y: mid - 8, w: bw, h: 16, r: 3, fill: C.other, stroke: C.otherStroke }
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
  const grid: Shape[] = [];
  for (let yr = startYear; yr <= endYear; yr++) {
    const gx = x(`${yr}-01-01`);
    grid.push(line(gx, 0, gx, bottom, C.grid, 1));
    grid.push(text(gx + 5, 15, String(yr), 'small', C.muted));
  }
  const mx = x(datum);
  const marker = line(mx, HEAD_H, mx, bottom + 2, C.marker, 2);

  // Legende
  const legend: Shape[] = [];
  const ly = bottom + 22;
  let lx = 0;
  const item = (swatch: Shape, label: string): void => {
    legend.push(swatch, text(lx + 22, ly + 4, label, 'small', C.muted));
    lx += 22 + measure(label, FONT_SMALL) + 20;
  };
  const kinds = { current: false, other: false };
  for (const r of rows) for (const b of r.bars) kinds[b.current ? 'current' : 'other'] = true;
  if (kinds.current) item({ k: 'rect', x: lx, y: ly - 5, w: 16, h: 9, r: 2, fill: C.current }, 'diese Rechnung');
  if (kinds.other) item({ k: 'rect', x: lx, y: ly - 5, w: 16, h: 9, r: 2, fill: C.other, stroke: C.otherStroke }, 'andere Rechnungen');
  if (rows.some((r) => !!r.ende)) item(line(lx + 8, ly - 7, lx + 8, ly + 6, C.cancel, 2), 'Kündigung');
  item(line(lx + 8, ly - 7, lx + 8, ly + 6, C.marker, 2), `Rechnungsdatum ${formatDate(datum)}`);

  return { shapes: grid.concat(body, [marker], legend), width: W, height: Math.ceil(ly + 12) };
}

const f1 = (n: number): string => n.toFixed(1);

/** SVG der Zeitleiste (für Tests und Vorschau). */
export function timelineSvg(input: IExportInput, measure: Measure = approxMeasure): ITimelineSvg | null {
  const res = timelineShapes(input, measure);
  if (!res) return null;
  const parts = res.shapes.map((s) => {
    switch (s.k) {
      case 'rect':
        return `<rect x="${f1(s.x)}" y="${f1(s.y)}" width="${f1(Math.max(s.w, 0))}" height="${f1(s.h)}" rx="${s.r}" fill="${s.fill}"${s.stroke ? ` stroke="${s.stroke}" stroke-width="1"` : ''}/>`;
      case 'line':
        return `<line x1="${f1(s.x1)}" y1="${f1(s.y1)}" x2="${f1(s.x2)}" y2="${f1(s.y2)}" stroke="${s.color}" stroke-width="${s.width}"/>`;
      default: {
        const f = s.font === 'label' ? 'font-size="15" font-weight="600"' : 'font-size="13"';
        return `<text x="${f1(s.x)}" y="${f1(s.y)}" font-family="${escapeXml(FAMILY)}" ${f} fill="${s.color}">${escapeXml(s.text)}</text>`;
      }
    }
  });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${res.width}" height="${res.height}" viewBox="0 0 ${res.width} ${res.height}">${parts.join('')}</svg>`;
  return { svg, width: res.width, height: res.height };
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/**
 * Zeichnet die Zeitleiste direkt auf ein Canvas (kein Laden von Bildern, daher keine
 * Probleme mit Sicherheitsrichtlinien) und liefert ein PNG in scale-facher Auflösung.
 */
export function renderTimelinePng(input: IExportInput, scale = 4): ITimelineImage | null {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const measure: Measure = (t, font) => {
    ctx.font = font;
    return ctx.measureText(t).width;
  };
  const res = timelineShapes(input, measure);
  if (!res) return null;

  canvas.width = Math.round(res.width * scale);
  canvas.height = Math.round(res.height * scale);
  ctx.scale(scale, scale);
  for (const s of res.shapes) {
    if (s.k === 'rect') {
      roundedRect(ctx, s.x, s.y, Math.max(s.w, 0), s.h, s.r);
      ctx.fillStyle = s.fill;
      ctx.fill();
      if (s.stroke) {
        ctx.strokeStyle = s.stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    } else if (s.k === 'line') {
      ctx.beginPath();
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.stroke();
    } else {
      ctx.font = FONTS[s.font];
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.x, s.y);
    }
  }
  // toDataURL statt toBlob: synchron und überall verfügbar
  const bin = atob(canvas.toDataURL('image/png').split(',')[1] || '');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { png: bytes.buffer, width: res.width, height: res.height };
}
