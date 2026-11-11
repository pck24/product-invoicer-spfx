import { totals, formatEuro } from '../money';
import { IPositionProposal, proposeInvoice } from '../proposal';
import { HUBER_STICHTAG, huberLines, huberPositions } from './fixtures';

describe('Referenzbeispiel Bäckerei Huber, Stichtag 31.12.2027', () => {
  const proposal = proposeInvoice(huberPositions, huberLines, HUBER_STICHTAG);
  const byId = (id: number): IPositionProposal => proposal.positions.filter((p) => p.position.id === id)[0];

  it('Microsoft 365 × 5: 01.01.–31.12.2027, 750,00 €', () => {
    const p = byId(1);
    expect(p.status).toBe('faellig');
    expect(p.segments).toHaveLength(1);
    expect(p.segments[0]).toMatchObject({ von: '2027-01-01', bis: '2027-12-31', monateX100: 1200, betragCent: 75000, art: 'Folgezeitraum' });
  });

  it('Domain .at: 15.03.2027–14.03.2028, 24,00 €', () => {
    const p = byId(2);
    expect(p.segments).toHaveLength(1);
    expect(p.segments[0]).toMatchObject({ von: '2027-03-15', bis: '2028-03-14', monateX100: 1200, betragCent: 2400, art: 'Folgezeitraum', hinweis: 'Verlängerung im Voraus' });
  });

  it('Domain .com: nicht fällig', () => {
    const p = byId(3);
    expect(p.status).toBe('nichtFaellig');
    expect(p.verrechnetBis).toBe('2028-08-31');
    expect(p.segments).toHaveLength(0);
  });

  it('Cloud-Backup: anteilig 2026 49,50 € und 2027 118,80 €', () => {
    const p = byId(4);
    expect(p.verrechnetBis).toBeNull();
    expect(p.segments).toHaveLength(2);
    expect(p.segments[0]).toMatchObject({ von: '2026-08-01', bis: '2026-12-31', monateX100: 500, betragCent: 4950, art: 'Anteilig', hinweis: 'anteilig nachverrechnet' });
    expect(p.segments[1]).toMatchObject({ von: '2027-01-01', bis: '2027-12-31', monateX100: 1200, betragCent: 11880, art: 'Folgezeitraum' });
  });

  it('SSL-Zertifikat: entfällt', () => {
    expect(byId(5).status).toBe('entfaellt');
    expect(byId(5).segments).toHaveLength(0);
  });

  it('Summen auf den Cent: 942,30 € netto, 188,46 € USt, 1.130,76 € brutto', () => {
    const t = totals(proposal.segments.map((s) => s.betragCent), 20);
    expect(t).toEqual({ nettoCent: 94230, ustCent: 18846, bruttoCent: 113076 });
    expect(formatEuro(t.nettoCent)).toBe('942,30 €');
    expect(formatEuro(t.ustCent)).toBe('188,46 €');
    expect(formatEuro(t.bruttoCent)).toBe('1.130,76 €');
  });

  it('Reihenfolge: fällig, nicht fällig, entfällt', () => {
    expect(proposal.positions.map((p) => p.status)).toEqual(['faellig', 'faellig', 'faellig', 'nichtFaellig', 'entfaellt']);
    expect(proposal.segments).toHaveLength(4);
  });

  it('Ein zweiter Vorschlag nach dem Speichern ist leer', () => {
    const saved = huberLines.concat(
      proposal.segments.map((s) => ({ positionId: s.positionId, von: s.von, bis: s.bis, status: 'Erstellt' as const }))
    );
    expect(proposeInvoice(huberPositions, saved, HUBER_STICHTAG).segments).toHaveLength(0);
  });
});
