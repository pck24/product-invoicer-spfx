import { addMonthsIso, formatDate, isIsoDate, parseDate } from '../dates';
import { divRoundHalfUp, formatEuro, formatMonate, lineAmountCent, formatZahl, parseEuro, parseUstSatz, totals } from '../money';
import { nextKundennummer } from '../numbering';
import { horizon, monthsX100 } from '../periods';

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

  it('Betrag = Jahrespreis × Menge × Monate / 12', () => {
    expect(lineAmountCent(15000, 5, 1200)).toBe(75000);
    expect(lineAmountCent(1800, 1, 2400)).toBe(3600);
    expect(lineAmountCent(11880, 1, 455)).toBe(4505); // 45,045 → 45,05
    expect(lineAmountCent(1000, 1, 100)).toBe(83); // 83,33 → 83
  });

  it('USt-Satz aus der Eingabe: 0 % bleibt 0 %', () => {
    expect(parseUstSatz('0')).toBe(0);
    expect(parseUstSatz(0)).toBe(0);
    expect(parseUstSatz('20,5')).toBe(20.5);
    expect(parseUstSatz('')).toBe(20);
    expect(parseUstSatz(undefined)).toBe(20);
    expect(parseUstSatz('abc', -1)).toBe(-1);
    expect(parseUstSatz('-5', -1)).toBe(-1);
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

describe('Horizont', () => {
  it('Rechnungsdatum + 3 Monate', () => {
    expect(horizon('2027-06-17')).toBe('2027-09-17');
    expect(horizon('2027-01-08')).toBe('2027-04-08');
  });
});

describe('Kundennummer', () => {
  it('höchste K-Nummer + 1, vierstellig', () => {
    expect(nextKundennummer(['K-1001', 'K-1005', 'X-9999'])).toBe('K-1006');
    expect(nextKundennummer([])).toBe('K-0001');
    expect(nextKundennummer(['K-0009'])).toBe('K-0010');
    expect(nextKundennummer(['K-9999'])).toBe('K-10000');
  });
});

describe('Zahlen und Monate', () => {
  it('formatZahl: Menge und USt-Satz einheitlich', () => {
    expect(formatZahl(5)).toBe('5');
    expect(formatZahl(20)).toBe('20');
    expect(formatZahl(20.5)).toBe('20,5');
    expect(formatZahl(2.25)).toBe('2,25');
    expect(formatZahl(1500)).toBe('1.500');
  });

  it('Monate über viele Jahre (O(1)-Schätzung) und Monatsenden', () => {
    expect(monthsX100('2020-01-01', '2119-12-31')).toBe(120000);
    expect(monthsX100('2027-01-31', '2027-03-30', '2027-01-31')).toBe(200);
    expect(monthsX100('2027-01-15', '2027-02-14')).toBe(100);
    expect(monthsX100('2027-01-15', '2027-02-13')).toBe(97); // 30/31 Tage
  });
});
