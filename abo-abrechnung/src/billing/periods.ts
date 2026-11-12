import { addDaysIso, addMonthsIso, diffDays } from './dates';
import { divRoundHalfUp } from './money';
import { ISODate } from './types';

/**
 * Findet k mit addMonths(anchor, k) === date. Liefert -1, wenn date nicht auf
 * dem Monatsraster des Ankers liegt.
 */
export function anchorIndex(anchor: ISODate, date: ISODate): number {
  if (date < anchor) return -1;
  const k = monthDiff(anchor, date);
  return addMonthsIso(anchor, k) === date ? k : -1;
}

/** Kalendermonate zwischen zwei Daten (nur Jahr/Monat, ohne Tage). */
function monthDiff(a: ISODate, b: ISODate): number {
  return (Number(b.substring(0, 4)) - Number(a.substring(0, 4))) * 12 + (Number(b.substring(5, 7)) - Number(a.substring(5, 7)));
}

/** Raster für ein Datum: am Anker, wenn das Datum darauf liegt, sonst am Datum selbst (k = Index im Raster). */
export function resolveAnchor(anchor: ISODate | undefined, date: ISODate): { base: ISODate; k: number } {
  const base = anchor || date;
  const k = anchorIndex(base, date);
  return k < 0 ? { base: date, k: 0 } : { base, k };
}

/**
 * Monate × 100 für den Zeitraum [von, bis].
 * Volle Monate werden am Monatsraster des Ankers gezählt (Standard: von selbst);
 * für die Resttage gilt Resttage / Tage dieses (angebrochenen) Monats.
 * Ergebnis auf 2 Dezimalstellen gerundet.
 */
export function monthsX100(von: ISODate, bis: ISODate, anchor?: ISODate): number {
  if (bis < von) return 0;
  const { base, k: k0 } = resolveAnchor(anchor, von);
  const end = addDaysIso(bis, 1); // exklusives Ende
  // volle Monate direkt schätzen und um höchstens einen korrigieren (O(1) statt Schleife je Monat)
  let n = Math.max(0, monthDiff(base, end) - k0);
  while (n > 0 && addMonthsIso(base, k0 + n) > end) n--;
  while (addMonthsIso(base, k0 + n + 1) <= end) n++;
  const restStart = addMonthsIso(base, k0 + n);
  const restDays = diffDays(restStart, end);
  if (restDays <= 0) return n * 100;
  const monthDays = diffDays(restStart, addMonthsIso(base, k0 + n + 1));
  return n * 100 + divRoundHalfUp(restDays * 100, monthDays);
}

/** Vorlauf: Zeiträume, die bis zu so vielen Monaten nach dem Rechnungsdatum beginnen, sind fällig. */
export const VORLAUF_MONATE = 3;

/** Spätester Beginn eines fälligen Zeitraums. */
export function horizon(rechnungsdatum: ISODate): ISODate {
  return addMonthsIso(rechnungsdatum, VORLAUF_MONATE);
}
