import { addDaysIso, addMonthsIso, diffDays } from './dates';
import { divRoundHalfUp } from './money';
import { ISODate } from './types';

/**
 * Findet k mit addMonths(anchor, k) === date. Liefert -1, wenn date nicht auf
 * dem Monatsraster des Ankers liegt.
 */
export function anchorIndex(anchor: ISODate, date: ISODate): number {
  if (date < anchor) return -1;
  const k =
    (Number(date.substring(0, 4)) - Number(anchor.substring(0, 4))) * 12 +
    (Number(date.substring(5, 7)) - Number(anchor.substring(5, 7)));
  return addMonthsIso(anchor, k) === date ? k : -1;
}

/**
 * Monate × 100 für den Zeitraum [von, bis].
 * Volle Monate werden am Monatsraster des Ankers gezählt (Standard: von selbst);
 * für die Resttage gilt Resttage / Tage dieses (angebrochenen) Monats.
 * Ergebnis auf 2 Dezimalstellen gerundet.
 */
export function monthsX100(von: ISODate, bis: ISODate, anchor?: ISODate): number {
  if (bis < von) return 0;
  let base = anchor || von;
  let k0 = anchorIndex(base, von);
  if (k0 < 0) {
    base = von;
    k0 = 0;
  }
  const end = addDaysIso(bis, 1); // exklusives Ende
  let n = 0;
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
