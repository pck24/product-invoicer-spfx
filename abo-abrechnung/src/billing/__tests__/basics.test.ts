import { addMonthsIso, formatDate, isIsoDate, parseDate } from '../dates';
import { divRoundHalfUp, formatEuro, formatMonate, lineAmountCent, parseEuro, totals } from '../money';
import { suggestNumber } from '../numbering';
import { billingYear, defaultStichtag, monthsX100 } from '../periods';

describe('dates', () => {
  it('formatiert und parst TT.MM.JJJJ', () => {
    expect(formatDate('2027-01-08')).toBe('08.01.2027');
    expect(parseDate('8.1.2027')).toBe('2027-01-08');
    expect(parseDate('31.02.2027')).toBeNull();
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2027-02-29')).toBe(false);
  });

  it('31.01. plus 1 Monat ist das Monatsende', () => {
    expect(addMonthsIso('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonthsIso('2028-01-31', 1)).toBe('2028-02-29');
  });
});

describe('Monate', () => {
  it('volle Kalendermonate und Resttage', () => {
    expect(monthsX100('2027-01-01', '2027-12-31')).toBe(1200);
    expect(monthsX100('2026-08-01', '2026-12-31')).toBe(500);
    expect(monthsX100('2027-01-01', '2027-01-15')).toBe(48); // 15/31
    expect(monthsX100('2027-03-15', '2028-03-14')).toBe(1200);
    expect(monthsX100('2027-03-01', '2027-02-01')).toBe(0);
  });
});

describe('Geld', () => {
  it('rundet kaufmännisch', () => {
    expect(divRoundHalfUp(5, 2)).toBe(3);
    expect(divRoundHalfUp(-5, 2)).toBe(-3);
    expect(divRoundHalfUp(4, 3)).toBe(1);
  });

  it('Betrag nach Preisbasis', () => {
    expect(lineAmountCent(1250, 5, 1200, 'Monat', 12)).toBe(75000);
    expect(lineAmountCent(3600, 1, 1200, 'Laufzeit', 24)).toBe(1800);
    expect(lineAmountCent(990, 1, 455, 'Monat', 1)).toBe(4505); // 45,045 → 45,05
  });

  it('USt auf die Nettosumme', () => {
    expect(totals([100, 100, 100], 20)).toEqual({ nettoCent: 300, ustCent: 60, bruttoCent: 360 });
    expect(totals([333], 20).ustCent).toBe(67); // 66,6 → 67
  });

  it('formatiert und parst Beträge', () => {
    expect(formatEuro(113076)).toBe('1.130,76 €');
    expect(formatEuro(5)).toBe('0,05 €');
    expect(formatEuro(123456789)).toBe('1.234.567,89 €');
    expect(formatEuro(-4950)).toBe('-49,50 €');
    expect(parseEuro('9,90')).toBe(990);
    expect(parseEuro('1.130,76 €')).toBe(113076);
    expect(parseEuro('9,9')).toBe(990);
    expect(parseEuro('24')).toBe(2400);
    expect(parseEuro('abc')).toBeNull();
    expect(formatMonate(1200)).toBe('12');
    expect(formatMonate(455)).toBe('4,55');
  });
});

describe('Abrechnungsjahr und Standard-Stichtag', () => {
  it('Abrechnungsjahr zum Stichtag', () => {
    expect(billingYear('2027-12-31')).toEqual({ start: '2027-01-01', end: '2027-12-31' });
    expect(billingYear('2028-03-31')).toEqual({ start: '2027-04-01', end: '2028-03-31' });
  });

  it('nächstgelegener Jahresbeginn', () => {
    expect(defaultStichtag(1, '2027-01-08')).toBe('2027-12-31');
    expect(defaultStichtag(1, '2026-11-11')).toBe('2027-12-31');
    expect(defaultStichtag(1, '2026-05-01')).toBe('2026-12-31');
    expect(defaultStichtag(4, '2027-03-20')).toBe('2028-03-31');
  });
});

describe('Nummernvorschlag', () => {
  it('RE-{YYYY}-{NNN}', () => {
    expect(suggestNumber('RE-{YYYY}-{NNN}', [], 2027)).toBe('RE-2027-001');
    expect(suggestNumber('RE-{YYYY}-{NNN}', ['RE-2026-044', 'RE-2027-001', 'RE-2027-009'], 2027)).toBe('RE-2027-010');
  });

  it('K-{NNNN}', () => {
    expect(suggestNumber('K-{NNNN}', ['K-1001', 'K-1005', 'X-9999'], 2027)).toBe('K-1006');
  });
});
