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

/** Abrechnungsjahr zum Stichtag S: [S − 12 Monate + 1 Tag, S]. */
export function billingYear(stichtag: ISODate): { start: ISODate; end: ISODate } {
  return { start: addDaysIso(addMonthsIso(stichtag, -12), 1), end: stichtag };
}

/**
 * Standard-Stichtag: Ende des Abrechnungsjahres, dessen Beginn (1. des
 * StichtagMonats) dem Bezugsdatum am nächsten liegt.
 */
export function defaultStichtag(stichtagMonat: number, bezugsdatum: ISODate): ISODate {
  const year = Number(bezugsdatum.substring(0, 4));
  const month = Math.min(12, Math.max(1, Math.round(stichtagMonat || 1)));
  let best: ISODate = '';
  let bestDiff = Number.MAX_VALUE;
  for (let y = year - 1; y <= year + 1; y++) {
    const start = `${y}-${month < 10 ? '0' : ''}${month}-01`;
    const diff = Math.abs(diffDays(bezugsdatum, start));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = start;
    }
  }
  return addDaysIso(addMonthsIso(best, 12), -1);
}
