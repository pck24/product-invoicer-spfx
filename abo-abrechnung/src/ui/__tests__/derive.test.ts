import { billed, huberLines, huberPositions, pos } from '../../billing/__tests__/fixtures';
import { IKunde, IPositionItem } from '../../data/mapping';
import { kpis, naechsterZeitraum, preisText, previewText, summarizeCustomer } from '../derive';

const huber: IKunde = { id: 1, name: 'Bäckerei Huber GmbH', kundennummer: 'K-1001', adresse: '', aktiv: true };
const huberPos: IPositionItem[] = huberPositions.map((p) => ({ ...p, kundeId: 1 }));

describe('Kundenübersicht', () => {
  it('Huber am 08.01.2027: M365 läuft bereits unverrechnet → gelb', () => {
    const s = summarizeCustomer(huber, huberPos, [], huberLines, '2027-01-08');
    expect(s.status).toEqual({ color: 'warning', text: 'Fällig · 1 Zeitraum' });
    expect(s.vorschlagNettoCent).toBe(75000);
    expect(s.aktivePositionen).toBe(4);
    expect(s.gekuendigtePositionen).toBe(1);
    expect(s.offen).toBe(true);
    expect(s.rechnungMoeglich).toBe(true);
  });

  it('Huber am 11.11.2026: nichts läuft unverrechnet, aber neue Position → rot', () => {
    const s = summarizeCustomer(huber, huberPos, [], huberLines, '2026-11-11');
    expect(s.status).toEqual({ color: 'danger', text: 'Neue Position · Zeitraum offen' });
    expect(s.naechsterTermin).toBe('2027-01-01');
  });

  it('alles verrechnet: grün mit frühestem „verrechnet bis“', () => {
    const p = [{ ...pos({ id: 9 }), kundeId: 2 }, { ...pos({ id: 10 }), kundeId: 2 }];
    const lines = [billed(9, '2026-01-01', '2027-03-31'), billed(10, '2026-01-01', '2026-12-31')];
    const s = summarizeCustomer({ ...huber, id: 2 }, p, [], lines, '2026-11-11');
    expect(s.status).toEqual({ color: 'success', text: 'Verrechnet bis 31.12.2026' });
    expect(s.offen).toBe(false);
  });

  it('Kennzahlen', () => {
    const s = summarizeCustomer(huber, huberPos, [], huberLines, '2027-01-08');
    expect(kpis([s])).toEqual({ naechsterTermin: '2027-01-01', offen: 1, gesamt: 1, vorschlagNettoCent: 75000 });
  });

  it('Nächster Zeitraum je Position', () => {
    const s = summarizeCustomer(huber, huberPos, [], huberLines, '2027-01-08');
    expect(s.proposals.map(naechsterZeitraum).map((x) => x.text)).toEqual([
      '01.01.2027 – 31.12.2027',
      '15.03.2027 – 14.03.2028',
      'bei erster Rechnung festlegen',
      'nicht fällig, ab 01.09.2028',
      'entfällt'
    ]);
  });
});

describe('Anzeige', () => {
  it('Preistext', () => {
    expect(preisText(huberPositions[1])).toBe('24,00 € / Jahr');
  });

  it('Vorschau im Positions-Drawer', () => {
    expect(previewText(huberPositions[3], [])).toContain('Noch nicht verrechnet');
    expect(previewText(huberPositions[1], huberLines)).toBe('Nächster Zeitraum: 15.03.2027 – 14.03.2028 (12 Monate, 24,00 €).');
    expect(previewText(huberPositions[2], huberLines)).toBe('Nächster Zeitraum: 01.09.2028 – 31.08.2030 (24 Monate, 36,00 €).');
    expect(previewText(huberPositions[4], huberLines)).toContain('Kein offener Zeitraum');
  });
});
