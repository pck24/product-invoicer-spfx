import { addDaysIso, addMonthsIso, maxIso, minIso } from './dates';
import { lineAmountCent } from './money';
import { anchorIndex, billingYear, monthsX100 } from './periods';
import { Art, IBilledLine, IPosition, ISODate } from './types';

export type PositionStatus = 'faellig' | 'nichtFaellig' | 'entfaellt';

export interface ISegment {
  positionId: number | null;
  title: string;
  von: ISODate;
  bis: ISODate;
  monateX100: number;
  menge: number;
  einzelpreisCent: number;
  betragCent: number;
  art: Art;
  hinweis: string;
}

export interface IPositionProposal {
  position: IPosition;
  verrechnetBis: ISODate | null;
  nextStart: ISODate;
  status: PositionStatus;
  segments: ISegment[];
}

export interface IInvoiceProposal {
  stichtag: ISODate;
  /** fällige Positionen zuerst, dann nicht fällige, dann entfallene */
  positions: IPositionProposal[];
  segments: ISegment[];
}

/** Zählt nur Rechnungen im Status Entwurf oder Erstellt. */
export function isActiveLine(line: IBilledLine): boolean {
  return line.status === 'Entwurf' || line.status === 'Erstellt';
}

export function verrechnetBis(positionId: number, lines: IBilledLine[]): ISODate | null {
  let max: ISODate | null = null;
  for (const l of lines) {
    if (l.positionId === positionId && l.bis && isActiveLine(l) && (max === null || l.bis > max)) {
      max = l.bis;
    }
  }
  return max;
}

export function nextStart(position: IPosition, lines: IBilledLine[]): ISODate {
  const vb = verrechnetBis(position.id, lines);
  return vb === null ? position.beginn : addDaysIso(vb, 1);
}

/** Anker für die Monatszählung: Laufzeit-Modus am Beginn ausgerichtet, sonst der Von-Tag. */
function monthAnchor(position: IPosition): ISODate | undefined {
  return position.modus === 'Laufzeit' ? position.beginn : undefined;
}

/** Monate und Betrag für einen (ggf. manuell geänderten) Zeitraum einer Position. */
export function computeLine(
  position: IPosition,
  von: ISODate,
  bis: ISODate
): { monateX100: number; betragCent: number } {
  const m = monthsX100(von, bis, monthAnchor(position));
  return {
    monateX100: m,
    betragCent: lineAmountCent(position.preisCent, position.menge, m, position.preisbasis, position.laufzeitMonate)
  };
}

export function hinweisFor(art: Art, modus: IPosition['modus'] | null, vorJahr: boolean): string {
  switch (art) {
    case 'Folgezeitraum':
      return modus === 'Laufzeit' ? 'Verlängerung im Voraus' : 'Folgezeitraum';
    case 'Anteilig':
      return vorJahr ? 'anteilig nachverrechnet' : 'anteilig';
    case 'Nachverrechnung':
      return 'Nachverrechnung';
    default:
      return 'einmalig';
  }
}

function makeSegment(position: IPosition, von: ISODate, bis: ISODate, art: Art, vorJahr: boolean): ISegment {
  const { monateX100, betragCent } = computeLine(position, von, bis);
  return {
    positionId: position.id,
    title: position.title,
    von,
    bis,
    monateX100,
    menge: position.menge,
    einzelpreisCent: position.preisCent,
    betragCent,
    art,
    hinweis: hinweisFor(art, position.modus, vorJahr)
  };
}

function stichtagSegments(position: IPosition, start: ISODate, stichtag: ISODate): ISegment[] {
  const { start: j } = billingYear(stichtag);
  const ende = position.ende;
  const result: ISegment[] = [];
  if (start < j) {
    let bis = addDaysIso(j, -1);
    if (ende) bis = minIso(bis, ende);
    const art: Art = start < addMonthsIso(j, -12) ? 'Nachverrechnung' : 'Anteilig';
    result.push(makeSegment(position, start, bis, art, true));
  }
  const von = maxIso(start, j);
  const bis = ende ? minIso(stichtag, ende) : stichtag;
  if (von <= bis) {
    const art: Art = von === j && bis === stichtag ? 'Folgezeitraum' : 'Anteilig';
    result.push(makeSegment(position, von, bis, art, false));
  }
  return result;
}

function laufzeitSegments(position: IPosition, start: ISODate, stichtag: ISODate): ISegment[] {
  const laufzeit = Math.max(1, position.laufzeitMonate);
  // Am Beginn ausgerichtetes Raster verhindert Drift am Monatsende.
  let anchor = position.beginn;
  let k = anchorIndex(anchor, start);
  if (k < 0) {
    anchor = start;
    k = 0;
  }
  const result: ISegment[] = [];
  let von = start;
  while (von <= stichtag && (!position.ende || von <= position.ende)) {
    k += laufzeit;
    let bis = addDaysIso(addMonthsIso(anchor, k), -1);
    if (position.ende) bis = minIso(bis, position.ende);
    result.push(makeSegment(position, von, bis, result.length === 0 ? 'Folgezeitraum' : 'Nachverrechnung', false));
    von = addDaysIso(bis, 1);
  }
  return result;
}

export function proposeForPosition(position: IPosition, lines: IBilledLine[], stichtag: ISODate): IPositionProposal {
  const vb = verrechnetBis(position.id, lines);
  const start = vb === null ? position.beginn : addDaysIso(vb, 1);
  const base = { position, verrechnetBis: vb, nextStart: start };
  if (position.ende && start > position.ende) return { ...base, status: 'entfaellt', segments: [] };
  if (start > stichtag) return { ...base, status: 'nichtFaellig', segments: [] };
  const segments =
    position.modus === 'Laufzeit'
      ? laufzeitSegments(position, start, stichtag)
      : stichtagSegments(position, start, stichtag);
  return { ...base, status: segments.length ? 'faellig' : 'nichtFaellig', segments };
}

const ORDER: { [k in PositionStatus]: number } = { faellig: 0, nichtFaellig: 1, entfaellt: 2 };

export function proposeInvoice(positions: IPosition[], lines: IBilledLine[], stichtag: ISODate): IInvoiceProposal {
  const items = positions.map((p) => proposeForPosition(p, lines, stichtag));
  const sorted = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => ORDER[a.item.status] - ORDER[b.item.status] || a.index - b.index)
    .map((x) => x.item);
  const segments: ISegment[] = [];
  for (const p of sorted) segments.push(...p.segments);
  return { stichtag, positions: sorted, segments };
}

/** Standarddefault des Abrechnungsmodus aus der Laufzeit. */
export function defaultModus(laufzeitMonate: number): IPosition['modus'] {
  return laufzeitMonate >= 12 ? 'Laufzeit' : 'Stichtag';
}
