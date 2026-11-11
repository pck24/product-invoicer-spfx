import { addDaysIso, addMonthsIso, minIso } from './dates';
import { lineAmountCent } from './money';
import { anchorIndex, horizon, monthsX100 } from './periods';
import { Art, IBilledLine, IPosition, ISODate } from './types';

/**
 * neu          – noch nie verrechnet; der erste Zeitraum wird frei gewählt
 * faellig      – nächster Zeitraum läuft bereits oder beginnt spätestens 3 Monate nach dem Rechnungsdatum
 * nichtFaellig – nächster Zeitraum beginnt später (kann trotzdem dazugenommen werden)
 * entfaellt    – bis zum Leistungsende verrechnet
 */
export type PositionStatus = 'neu' | 'faellig' | 'nichtFaellig' | 'entfaellt';

export interface ISegment {
  positionId: number | null;
  title: string;
  von: ISODate;
  bis: ISODate;
  monateX100: number;
  menge: number;
  /** Jahrespreis je Stück */
  einzelpreisCent: number;
  betragCent: number;
  art: Art;
  hinweis: string;
}

export interface IPositionProposal {
  position: IPosition;
  verrechnetBis: ISODate | null;
  /** nächster offener Tag; null = noch nie verrechnet */
  nextStart: ISODate | null;
  status: PositionStatus;
  /** nächster Zeitraum (höchstens einer); auch bei nichtFaellig vorhanden, damit er dazugenommen werden kann */
  segments: ISegment[];
}

export interface IInvoiceProposal {
  rechnungsdatum: ISODate;
  /** fällig, neu, nicht fällig, entfällt */
  positions: IPositionProposal[];
  /** nur die fälligen Zeiträume (vorausgewählt) */
  segments: ISegment[];
}

/** Zählt nur Rechnungen im Status Entwurf oder Erstellt. */
export function isActiveLine(line: IBilledLine): boolean {
  return line.status === 'Entwurf' || line.status === 'Erstellt';
}

function activeLines(positionId: number, lines: IBilledLine[]): IBilledLine[] {
  return lines.filter((l) => l.positionId === positionId && !!l.von && !!l.bis && isActiveLine(l));
}

export function verrechnetBis(positionId: number, lines: IBilledLine[]): ISODate | null {
  let max: ISODate | null = null;
  for (const l of activeLines(positionId, lines)) if (max === null || (l.bis as string) > max) max = l.bis;
  return max;
}

/** Tag nach "verrechnet bis"; null, wenn die Position noch nie verrechnet wurde. */
export function nextStart(position: IPosition, lines: IBilledLine[]): ISODate | null {
  const vb = verrechnetBis(position.id, lines);
  return vb === null ? null : addDaysIso(vb, 1);
}

/** Erster verrechneter Tag; Anker des Monatsrasters, damit Monatsenden nicht wandern. */
export function firstBilled(positionId: number, lines: IBilledLine[]): ISODate | null {
  let min: ISODate | null = null;
  for (const l of activeLines(positionId, lines)) if (min === null || (l.von as string) < min) min = l.von;
  return min;
}

/** Monate und Betrag für einen Zeitraum einer Position. */
export function computeLine(position: IPosition, von: ISODate, bis: ISODate, anchor?: ISODate): { monateX100: number; betragCent: number } {
  const m = monthsX100(von, bis, anchor);
  return { monateX100: m, betragCent: lineAmountCent(position.jahrespreisCent, position.menge, m) };
}

export function hinweisFor(art: Art): string {
  switch (art) {
    case 'Folgezeitraum':
      return 'Folgezeitraum';
    case 'Anteilig':
      return 'anteilig bis Kündigungsdatum';
    case 'Nachverrechnung':
      return 'Nachverrechnung';
    default:
      return 'einmalig';
  }
}

export function makeSegment(position: IPosition, von: ISODate, bis: ISODate, art: Art, anchor?: ISODate): ISegment {
  const { monateX100, betragCent } = computeLine(position, von, bis, anchor);
  return {
    positionId: position.id,
    title: position.title,
    von,
    bis,
    monateX100,
    menge: position.menge,
    einzelpreisCent: position.jahrespreisCent,
    betragCent,
    art,
    hinweis: hinweisFor(art)
  };
}

export function proposeForPosition(position: IPosition, lines: IBilledLine[], rechnungsdatum: ISODate): IPositionProposal {
  const vb = verrechnetBis(position.id, lines);
  if (vb === null) return { position, verrechnetBis: null, nextStart: null, status: 'neu', segments: [] };
  const start = addDaysIso(vb, 1);
  const base = { position, verrechnetBis: vb, nextStart: start };
  if (position.ende && start > position.ende) return { ...base, status: 'entfaellt', segments: [] };

  // Raster am ersten verrechneten Tag ausrichten (verhindert Drift am Monatsende)
  const laufzeit = Math.max(1, Math.round(position.laufzeitMonate || 12));
  let anchor = firstBilled(position.id, lines) || start;
  let k = anchorIndex(anchor, start);
  if (k < 0) {
    anchor = start;
    k = 0;
  }
  let bis = addDaysIso(addMonthsIso(anchor, k + laufzeit), -1);
  let art: Art = 'Folgezeitraum';
  if (position.ende && position.ende < bis) {
    bis = minIso(bis, position.ende);
    art = 'Anteilig';
  }
  const status: PositionStatus = start <= horizon(rechnungsdatum) ? 'faellig' : 'nichtFaellig';
  return { ...base, status, segments: [makeSegment(position, start, bis, art, anchor)] };
}

const ORDER: { [k in PositionStatus]: number } = { faellig: 0, neu: 1, nichtFaellig: 2, entfaellt: 3 };

export function proposeInvoice(positions: IPosition[], lines: IBilledLine[], rechnungsdatum: ISODate): IInvoiceProposal {
  const sorted = positions
    .map((p, index) => ({ item: proposeForPosition(p, lines, rechnungsdatum), index }))
    .sort((a, b) => ORDER[a.item.status] - ORDER[b.item.status] || a.index - b.index)
    .map((x) => x.item);
  const segments: ISegment[] = [];
  for (const p of sorted) if (p.status === 'faellig') segments.push(...p.segments);
  return { rechnungsdatum, positions: sorted, segments };
}
