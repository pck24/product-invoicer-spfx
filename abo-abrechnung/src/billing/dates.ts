import { addDays, addMonths, differenceInCalendarDays, format } from 'date-fns';
import { ISODate } from './types';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DE_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;

export function isIsoDate(value: string | null | undefined): value is ISODate {
  if (!value) return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return fromDate(d) === value;
}

/** Lokales Date-Objekt um Mitternacht. Nur für date-fns-Berechnungen. */
export function toDate(value: ISODate): Date {
  const m = ISO_RE.exec(value);
  if (!m) throw new Error(`Ungültiges Datum: ${value}`);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setFullYear(Number(m[1])); // Jahre < 100 korrekt behandeln
  return d;
}

export function fromDate(d: Date): ISODate {
  return format(d, 'yyyy-MM-dd');
}

export function addDaysIso(value: ISODate, days: number): ISODate {
  return fromDate(addDays(toDate(value), days));
}

/** Monatsaddition; Monatsende wird begrenzt (31.01. + 1 Monat = 28./29.02.). */
export function addMonthsIso(value: ISODate, months: number): ISODate {
  return fromDate(addMonths(toDate(value), months));
}

/** Tage von a bis b (b − a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(toDate(b), toDate(a));
}

export function minIso(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxIso(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function todayIso(): ISODate {
  return fromDate(new Date());
}

/** YYYY-MM-DD → TT.MM.JJJJ */
export function formatDate(value: ISODate | null | undefined): string {
  if (!value) return '';
  const m = ISO_RE.exec(value);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : value;
}

/** TT.MM.JJJJ (auch T.M.JJJJ) → YYYY-MM-DD, sonst null. */
export function parseDate(value: string): ISODate | null {
  const m = DE_RE.exec(value.trim());
  if (!m) return null;
  const iso = `${m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`;
  return isIsoDate(iso) ? iso : null;
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
