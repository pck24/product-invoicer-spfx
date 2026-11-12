import { formatEuro, totals } from '../money';
import { computeLine, faelligeSegmente, IPositionProposal, proposeInvoice } from '../proposal';
import { validateInvoice } from '../validation';
import { HUBER_DATUM, huberLines, huberPositions } from './fixtures';

describe('Referenzbeispiel Bäckerei Huber, Rechnung vom 08.01.2027', () => {
  const proposal = proposeInvoice(huberPositions, huberLines, HUBER_DATUM);
  const byId = (id: number): IPositionProposal => proposal.filter((p) => p.position.id === id)[0];

  it('Microsoft 365 × 5: schließt an, 01.01.–31.12.2027, 750,00 €', () => {
    expect(byId(1).status).toBe('faellig');
    expect(byId(1).next).toMatchObject({ von: '2027-01-01', bis: '2027-12-31', monateX100: 1200, betragCent: 75000, art: 'Folgezeitraum' });
  });

  it('Domain .at: 15.03.2027–14.03.2028, 24,00 €', () => {
    expect(byId(2).next).toMatchObject({ von: '2027-03-15', bis: '2028-03-14', monateX100: 1200, betragCent: 2400 });
  });

  it('Domain .com (2 Jahre, bezahlt bis 31.08.2028): nicht fällig', () => {
    expect(byId(3).status).toBe('nichtFaellig');
    expect(faelligeSegmente(proposal).filter((s) => s.positionId === 3)).toHaveLength(0);
  });

  it('Cloud-Backup: noch nie verrechnet, kein Vorschlag (erster Zeitraum frei)', () => {
    expect(byId(4).status).toBe('neu');
    expect(byId(4).next).toBeNull();
  });

  it('SSL-Zertifikat: entfällt', () => {
    expect(byId(5).status).toBe('entfaellt');
  });

  it('Summen mit manuellem Cloud-Backup 01.08.2026–31.12.2027: 942,30 / 188,46 / 1.130,76 €', () => {
    const cloud = computeLine(huberPositions[3], '2026-08-01', '2027-12-31');
    expect(cloud).toEqual({ monateX100: 1700, betragCent: 16830 }); // = 49,50 + 118,80
    const t = totals(faelligeSegmente(proposal).map((s) => s.betragCent).concat(cloud.betragCent), 20);
    expect(t).toEqual({ nettoCent: 94230, ustCent: 18846, bruttoCent: 113076 });
    expect(formatEuro(t.bruttoCent)).toBe('1.130,76 €');
  });

  it('Vorschlag plus manueller Zeitraum besteht die Prüfung', () => {
    const lines = faelligeSegmente(proposal)
      .map((s, i) => ({ key: String(i), positionId: s.positionId, title: s.title, von: s.von, bis: s.bis }))
      .concat({ key: 'c', positionId: 4, title: 'Cloud-Backup', von: '2026-08-01', bis: '2027-12-31' });
    expect(validateInvoice({ invoiceNumber: '2027-001', existingInvoiceNumbers: [], lines, positions: huberPositions, billedLines: huberLines })).toEqual([]);
  });

  it('Reihenfolge: fällig, neu, nicht fällig, entfällt', () => {
    expect(proposal.map((p) => p.status)).toEqual(['faellig', 'faellig', 'neu', 'nichtFaellig', 'entfaellt']);
  });

  it('Ein zweiter Vorschlag nach dem Speichern ist leer', () => {
    const saved = huberLines
      .concat(faelligeSegmente(proposal).map((s) => ({ positionId: s.positionId, von: s.von, bis: s.bis, status: 'Erstellt' as const })))
      .concat({ positionId: 4, von: '2026-08-01', bis: '2027-12-31', status: 'Erstellt' });
    expect(faelligeSegmente(proposeInvoice(huberPositions, saved, HUBER_DATUM))).toHaveLength(0);
  });
});
