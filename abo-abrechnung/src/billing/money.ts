import { Preisbasis } from './types';

/** Ganzzahlige Division mit kaufmännischer Rundung (halbe Werte vom Nullpunkt weg). */
export function divRoundHalfUp(num: number, den: number): number {
  if (den === 0) throw new Error('Division durch 0');
  const sign = (num < 0) !== (den < 0) ? -1 : 1;
  const n = Math.abs(num);
  const d = Math.abs(den);
  const result = sign * Math.floor((2 * n + d) / (2 * d));
  return result === 0 ? 0 : result; // -0 vermeiden
}

/**
 * Zeilenbetrag in Cent.
 * Monat:    Preis × Menge × Monate
 * Laufzeit: Preis × Menge × Monate / LaufzeitMonate
 * monateX100 = Monate × 100 (2 Dezimalstellen als Integer).
 */
export function lineAmountCent(
  preisCent: number,
  menge: number,
  monateX100: number,
  preisbasis: Preisbasis,
  laufzeitMonate: number
): number {
  const mengeX100 = Math.round(menge * 100);
  const num = preisCent * mengeX100 * monateX100;
  const den = 100 * 100 * (preisbasis === 'Laufzeit' ? Math.max(1, laufzeitMonate) : 1);
  return divRoundHalfUp(num, den);
}

export interface ITotals {
  nettoCent: number;
  ustCent: number;
  bruttoCent: number;
}

/** USt wird auf die Nettosumme gerechnet. */
export function totals(betraegeCent: number[], ustSatzProzent: number): ITotals {
  let netto = 0;
  for (const b of betraegeCent) netto += b;
  const ust = divRoundHalfUp(netto * Math.round(ustSatzProzent * 100), 10000);
  return { nettoCent: netto, ustCent: ust, bruttoCent: netto + ust };
}

/** 113076 → "1.130,76 €" */
export function formatEuro(cent: number): string {
  return `${formatAmount(cent)} €`;
}

/** 113076 → "1.130,76" */
export function formatAmount(cent: number): string {
  const sign = cent < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cent));
  const euros = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const c = abs % 100;
  return `${sign}${euros},${c < 10 ? '0' : ''}${c}`;
}

/** "1.130,76 €" / "9,9" / "24" → Cent, sonst null. */
export function parseEuro(value: string): number | null {
  let s = value.replace(/€/g, '').replace(/\s/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  s = s.replace(',', '.');
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const frac = m[3] ? (m[3].length === 1 ? m[3] + '0' : m[3]) : '00';
  const cent = Number(m[2]) * 100 + Number(frac);
  return m[1] === '-' ? -cent : cent;
}

/** 1200 → "12", 455 → "4,55" */
export function formatMonate(monateX100: number): string {
  if (monateX100 % 100 === 0) return String(monateX100 / 100);
  return formatAmount(monateX100);
}
