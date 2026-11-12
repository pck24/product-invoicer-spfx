import { addDaysIso, addMonthsIso, minIso } from './dates';
import { lineAmountCent } from './money';
import { horizon, monthsX100, resolveAnchor } from './periods';
import { Art, IBilledLine, IPosition, ISODate } from './types';

/**
 * neu          – noch nie verrechnet; der erste Zeitraum wird frei gewählt
 * faellig      – nächster Zeitraum läuft bereits oder beginnt spätestens 3 Monate nach dem Rechnungsdatum
 * nichtFaellig – nächster Zeitraum beginnt später (kann trotzdem dazugenommen werden)
 * entfaellt    – bis zum Kündigungsdatum verrechnet
 */
export type PositionStatus = 'neu' | 'faellig' | 'nichtFaellig' | 'entfaellt';

/** Anzeige- und Vorschlagsreihenfolge der Status. */
export const STATUS_ORDER: PositionStatus[] = ['faellig', 'neu', 'nichtFaellig', 'entfaellt'];

export interface ISegment {
  positionId: number;
  title: string;
  von: ISODate;
  bis: ISODate;
  monateX100: number;
  menge: number;
  /** Jahrespreis je Stück */
  einzelpreisCent: number;
  betragCent: number;
  art: Art;
}

export interface IPositionProposal<P extends IPosition = IPosition> {
  position: P;
  verrechnetBis: ISODate | null;
  /** nächster offener Tag; null = noch nie verrechnet */
  nextStart: ISODate | null;
  status: PositionStatus;
  /** nächster Zeitraum; auch bei nichtFaellig vorhanden, damit er dazugenommen werden kann */
  next: ISegment | null;
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

/** Fällig, wenn der Zeitraum bereits läuft oder spätestens 3 Monate nach dem Rechnungsdatum beginnt. */
export function statusFor(start: ISODate, rechnungsdatum: ISODate): 'faellig' | 'nichtFaellig' {
  return start <= horizon(rechnungsdatum) ? 'faellig' : 'nichtFaellig';
}

/** Anteilig, wenn der Zeitraum am Kündigungsdatum endet und kürzer als die Laufzeit ist. */
export function artFor(position: IPosition, bis: ISODate, monateX100: number): Art {
  return position.ende && bis === position.ende && monateX100 < Math.max(1, position.laufzeitMonate) * 100 ? 'Anteilig' : 'Folgezeitraum';
}

/** Monate und Betrag für einen Zeitraum einer Position. */
export function computeLine(position: IPosition, von: ISODate, bis: ISODate, anchor?: ISODate): { monateX100: number; betragCent: number } {
  const m = monthsX100(von, bis, anchor);
  return { monateX100: m, betragCent: lineAmountCent(position.jahrespreisCent, position.menge, m) };
}

function makeSegment(position: IPosition, von: ISODate, bis: ISODate, anchor: ISODate): ISegment {
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
    art: artFor(position, bis, monateX100)
  };
}

export function proposeForPosition<P extends IPosition>(position: P, lines: IBilledLine[], rechnungsdatum: ISODate): IPositionProposal<P> {
  const vb = verrechnetBis(position.id, lines);
  if (vb === null) return { position, verrechnetBis: null, nextStart: null, status: 'neu', next: null };
  const start = addDaysIso(vb, 1);
  const base = { position, verrechnetBis: vb, nextStart: start };
  if (position.ende && start > position.ende) return { ...base, status: 'entfaellt', next: null };

  // Raster am ersten verrechneten Tag ausrichten (verhindert Drift am Monatsende)
  const laufzeit = Math.max(1, Math.round(position.laufzeitMonate || 12));
  const { base: anchor, k } = resolveAnchor(firstBilled(position.id, lines) || undefined, start);
  let bis = addDaysIso(addMonthsIso(anchor, k + laufzeit), -1);
  if (position.ende) bis = minIso(bis, position.ende);
  return { ...base, status: statusFor(start, rechnungsdatum), next: makeSegment(position, start, bis, anchor) };
}

/** Vorschlag für alle Positionen, sortiert nach STATUS_ORDER (sonst in Eingabereihenfolge). */
export function proposeInvoice<P extends IPosition>(positions: P[], lines: IBilledLine[], rechnungsdatum: ISODate): IPositionProposal<P>[] {
  return positions
    .map((p, index) => ({ item: proposeForPosition(p, lines, rechnungsdatum), index }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.item.status) - STATUS_ORDER.indexOf(b.item.status) || a.index - b.index)
    .map((x) => x.item);
}

/** Die fälligen (vorausgewählten) Zeiträume eines Vorschlags. */
export function faelligeSegmente(proposals: IPositionProposal[]): ISegment[] {
  return proposals.filter((p) => p.status === 'faellig' && p.next).map((p) => p.next as ISegment);
}
