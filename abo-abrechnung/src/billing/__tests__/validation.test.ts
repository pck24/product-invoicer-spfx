import { proposeInvoice } from '../proposal';
import { hasErrors, IDraftLine, validateInvoice } from '../validation';
import { billed, HUBER_DATUM, huberLines, huberPositions, pos } from './fixtures';

const p1 = pos({ id: 1, title: 'M365', beginn: '2024-01-01', ende: '2027-09-30' });
const base = { invoiceNumber: 'RE-2027-001', existingInvoiceNumbers: ['RE-2026-004'], positions: [p1], billedLines: [billed(1, '2026-01-01', '2026-12-31', 'Erstellt', 'RE-2026-004')] };
const line = (von: string, bis: string, key = 'a'): IDraftLine => ({ key, positionId: 1, title: 'M365', von, bis });

describe('validateInvoice', () => {
  it('lückenloser Anschluss ist gültig', () => {
    expect(validateInvoice({ ...base, lines: [line('2027-01-01', '2027-06-30')] })).toEqual([]);
  });

  it('Überschneidung mit bestehender Rechnungsposition ist ein Fehler', () => {
    const issues = validateInvoice({ ...base, lines: [line('2026-12-01', '2027-06-30')] });
    expect(hasErrors(issues)).toBe(true);
    expect(issues[0].message).toContain('RE-2026-004');
  });

  it('Überschneidung mit einem Entwurf ist ein Fehler', () => {
    const issues = validateInvoice({ ...base, billedLines: base.billedLines.concat(billed(1, '2027-01-01', '2027-03-31', 'Entwurf')), lines: [line('2027-01-01', '2027-06-30')] });
    expect(hasErrors(issues)).toBe(true);
  });

  it('Stornierung gibt die Zeiträume wieder frei', () => {
    const storniert = [billed(1, '2026-01-01', '2026-12-31', 'Storniert', 'RE-2026-004'), billed(1, '2025-01-01', '2025-12-31')];
    expect(validateInvoice({ ...base, billedLines: storniert, lines: [line('2026-01-01', '2026-12-31')] })).toEqual([]);
    // Huber: RE-2026-004 storniert → M365 schließt wieder an 2025 an bzw. ist wieder "neu"
    const lines = huberLines.map((l) => (l.rechnungsnummer === 'RE-2026-004' ? { ...l, status: 'Storniert' as const } : l));
    const proposal = proposeInvoice(huberPositions, lines, HUBER_DATUM);
    expect(proposal.positions.filter((p) => p.position.id === 1)[0].status).toBe('neu');
    expect(proposal.positions.filter((p) => p.position.id === 3)[0].status).toBe('neu');
  });

  it('Von vor Vertragsbeginn ist ein Fehler (erste Verrechnung)', () => {
    const issues = validateInvoice({ ...base, billedLines: [], lines: [line('2023-12-01', '2023-12-31')] });
    expect(hasErrors(issues)).toBe(true);
    expect(issues[0].message).toContain('Vertragsbeginn');
  });

  it('erste Verrechnung: Zeitraum frei wählbar, keine Lücken-Warnung', () => {
    expect(validateInvoice({ ...base, billedLines: [], lines: [line('2025-06-15', '2026-07-14')] })).toEqual([]);
  });

  it('Bis vor Von ist ein Fehler', () => {
    expect(hasErrors(validateInvoice({ ...base, lines: [line('2027-03-01', '2027-02-01')] }))).toBe(true);
  });

  it('Bis nach dem Leistungsende ist ein Fehler', () => {
    const issues = validateInvoice({ ...base, lines: [line('2027-01-01', '2027-12-31')] });
    expect(issues.map((i) => i.severity)).toEqual(['error']);
    expect(issues[0].message).toContain('Leistungsende');
  });

  it('bestehende Rechnungsnummer ist ein Fehler (Groß-/Kleinschreibung egal)', () => {
    expect(hasErrors(validateInvoice({ ...base, invoiceNumber: ' re-2026-004 ', lines: [] }))).toBe(true);
  });

  it('Lücke ist eine Warnung, kein Fehler', () => {
    const issues = validateInvoice({ ...base, lines: [line('2027-02-01', '2027-06-30')] });
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(hasErrors(issues)).toBe(false);
  });

  it('mehrere Segmente derselben Position schließen aneinander an', () => {
    const lines = [line('2027-04-01', '2027-06-30', 'b'), line('2027-01-01', '2027-03-31', 'a')];
    expect(validateInvoice({ ...base, lines })).toEqual([]);
  });

  it('Segmente innerhalb derselben Rechnung dürfen sich nicht überschneiden', () => {
    const lines = [line('2027-01-01', '2027-03-31', 'a'), line('2027-03-01', '2027-06-30', 'b')];
    expect(hasErrors(validateInvoice({ ...base, lines }))).toBe(true);
  });

  it('einmalige Positionen ohne Zeitraum sind erlaubt', () => {
    expect(validateInvoice({ ...base, lines: [{ key: 'x', positionId: null, title: 'Einrichtung', von: null, bis: null }] })).toEqual([]);
  });

  it('der vollständige Huber-Vorschlag besteht die Prüfung', () => {
    const proposal = proposeInvoice(huberPositions, huberLines, HUBER_DATUM);
    const lines = proposal.segments.map((s, i) => ({ key: String(i), positionId: s.positionId, title: s.title, von: s.von, bis: s.bis }));
    expect(validateInvoice({ invoiceNumber: 'RE-2027-001', existingInvoiceNumbers: ['RE-2026-004'], lines, positions: huberPositions, billedLines: huberLines })).toEqual([]);
  });
});
