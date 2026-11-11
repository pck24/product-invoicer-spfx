import { HUBER_STICHTAG, huberLines, huberPositions, pos } from '../../billing/__tests__/fixtures';
import { IKunde, IPositionItem } from '../../data/mapping';
import { billingYearEndContaining, kpis, naechsterZeitraum, preisText, previewText, summarizeCustomer } from '../derive';

const huber: IKunde = { id: 1, name: 'Bäckerei Huber GmbH', kundennummer: 'K-1001', adresse: '', stichtagMonat: 1, aktiv: true };
const huberPos: IPositionItem[] = huberPositions.map((p) => ({ ...p, kundeId: 1 }));
const TODAY = '2026-11-11';

describe('Kundenübersicht', () => {
  const s = summarizeCustomer(huber, huberPos, [], huberLines, TODAY);

  it('Huber: Stichtag 31.12.2027, gelb fällig mit 4 Zeiträumen', () => {
    expect(s.stichtag).toBe(HUBER_STICHTAG);
    expect(s.status).toEqual({ color: 'warning', text: 'Fällig · 4 Zeiträume' });
    expect(s.vorschlagNettoCent).toBe(94230);
    expect(s.aktivePositionen).toBe(4);
    expect(s.gekuendigtePositionen).toBe(1);
  });

  it('nur neue Positionen offen: rot', () => {
    const p = [{ ...pos({ id: 9, beginn: '2026-08-01' }), kundeId: 2 }];
    const r = summarizeCustomer({ ...huber, id: 2 }, p, [], [], TODAY);
    expect(r.status).toEqual({ color: 'danger', text: 'Neue Position · anteilig offen' });
  });

  it('alles verrechnet: grün mit frühestem Datum', () => {
    const p = [{ ...pos({ id: 9, beginn: '2025-01-01' }), kundeId: 2 }, { ...pos({ id: 10, beginn: '2025-01-01' }), kundeId: 2 }];
    const lines = [
      { positionId: 9, von: '2025-01-01', bis: '2028-03-31', status: 'Erstellt' as const },
      { positionId: 10, von: '2025-01-01', bis: '2027-12-31', status: 'Erstellt' as const }
    ];
    expect(summarizeCustomer({ ...huber, id: 2 }, p, [], lines, TODAY).status).toEqual({ color: 'success', text: 'Verrechnet bis 31.12.2027' });
  });

  it('Kennzahlen', () => {
    expect(kpis([s])).toEqual({ naechsterTermin: '2027-01-01', offen: 1, gesamt: 1, vorschlagNettoCent: 94230 });
  });

  it('Nächster Zeitraum je Position', () => {
    expect(s.proposals.map(naechsterZeitraum).map((x) => x.text)).toEqual([
      '01.01.2027 – 31.12.2027',
      '15.03.2027 – 14.03.2028',
      '01.08.2026 – 31.12.2027',
      'nicht fällig',
      'entfällt'
    ]);
  });
});

describe('Anzeige', () => {
  it('Preistexte', () => {
    expect(preisText(huberPositions[0])).toBe('12,50 € / Mon.');
    expect(preisText(huberPositions[1])).toBe('24,00 € / Jahr');
    expect(preisText(huberPositions[2])).toBe('36,00 € / 2 Jahre');
  });

  it('Abrechnungsjahr, das ein Datum enthält', () => {
    expect(billingYearEndContaining('2026-08-01', 1)).toBe('2026-12-31');
    expect(billingYearEndContaining('2026-02-01', 4)).toBe('2026-03-31');
    expect(billingYearEndContaining('2026-04-01', 4)).toBe('2027-03-31');
  });

  it('Vorschau im Positions-Drawer (Mockup)', () => {
    expect(previewText(huberPositions[3], [], 1)).toBe(
      'Wird erstmals verrechnet: 01.08.2026 – 31.12.2026 (anteilig, 5 Monate, 49,50 €), danach jährlich zum 01.01.'
    );
    expect(previewText(huberPositions[1], huberLines, 1)).toBe(
      'Nächster Zeitraum: 15.03.2027 – 14.03.2028 (im Voraus, 12 Monate, 24,00 €), danach alle 12 Monate im Voraus.'
    );
    expect(previewText(huberPositions[4], huberLines, 1)).toContain('Kein offener Zeitraum');
  });
});
