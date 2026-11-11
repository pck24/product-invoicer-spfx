import { computeLine, nextStart, proposeForPosition, verrechnetBis } from '../proposal';
import { billed, pos } from './fixtures';

describe('verrechnetBis / nextStart', () => {
  it('ignoriert stornierte Rechnungen', () => {
    const p = pos({ id: 1 });
    const lines = [billed(1, '2025-01-01', '2025-12-31'), billed(1, '2026-01-01', '2026-12-31', 'Storniert')];
    expect(verrechnetBis(1, lines)).toBe('2025-12-31');
    expect(nextStart(p, lines)).toBe('2026-01-01');
  });

  it('Entwürfe zählen als verrechnet', () => {
    expect(verrechnetBis(1, [billed(1, '2025-01-01', '2025-12-31', 'Entwurf')])).toBe('2025-12-31');
  });

  it('ohne Rechnung gibt es keinen nächsten Tag (erster Zeitraum frei)', () => {
    expect(nextStart(pos({ id: 1 }), [])).toBeNull();
  });
});

describe('Folgezeitraum schließt an', () => {
  it('individueller erster Zeitraum (13 Monate), danach 12 Monate', () => {
    const p = pos({ id: 1, jahrespreisCent: 1200 });
    const r = proposeForPosition(p, [billed(1, '2026-06-15', '2027-07-14')], '2027-06-17');
    expect(r.segments[0]).toMatchObject({ von: '2027-07-15', bis: '2028-07-14', monateX100: 1200, betragCent: 1200 });
  });

  it('Rechnung am 17.06.: Zeitraum ab 01.03. (bereits begonnen) wird vorgeschlagen', () => {
    const p = pos({ id: 1 });
    const r = proposeForPosition(p, [billed(1, '2026-03-01', '2027-02-28')], '2027-06-17');
    expect(r.segments[0]).toMatchObject({ von: '2027-03-01', bis: '2028-02-29', monateX100: 1200 });
  });

  it('im Voraus bezahlt (2 Jahre): nicht fällig, Zeitraum kann aber dazugenommen werden', () => {
    const p = pos({ id: 1, laufzeitMonate: 24 });
    const r = proposeForPosition(p, [billed(1, '2026-09-01', '2028-08-31')], '2027-06-17');
    expect(r.status).toBe('nichtFaellig');
    expect(r.segments[0]).toMatchObject({ von: '2028-09-01', bis: '2030-08-31' });
  });

  it('fällig, wenn der Zeitraum spätestens 3 Monate nach dem Rechnungsdatum beginnt', () => {
    const p = pos({ id: 1 });
    expect(proposeForPosition(p, [billed(1, '2026-09-17', '2027-09-16')], '2027-06-17').status).toBe('faellig');
    expect(proposeForPosition(p, [billed(1, '2026-09-18', '2027-09-17')], '2027-06-17').status).toBe('nichtFaellig');
  });

  it('mehrjährige Laufzeit: Jahrespreis × Jahre', () => {
    const p = pos({ id: 1, jahrespreisCent: 1800, laufzeitMonate: 24 });
    const r = proposeForPosition(p, [billed(1, '2024-09-01', '2026-08-31')], '2026-06-01');
    expect(r.segments[0]).toMatchObject({ von: '2026-09-01', bis: '2028-08-31', monateX100: 2400, betragCent: 3600 });
  });

  it('Menge wird multipliziert', () => {
    const p = pos({ id: 1, menge: 5, jahrespreisCent: 15000 });
    expect(computeLine(p, '2027-01-01', '2027-12-31')).toEqual({ monateX100: 1200, betragCent: 75000 });
  });
});

describe('Kündigung mitten im Zeitraum', () => {
  it('Zeitraum endet am Leistungsende, anteilig', () => {
    const p = pos({ id: 1, menge: 5, jahrespreisCent: 15000, ende: '2027-06-30' });
    const r = proposeForPosition(p, [billed(1, '2026-01-01', '2026-12-31')], '2027-01-08');
    expect(r.segments[0]).toMatchObject({ von: '2027-01-01', bis: '2027-06-30', monateX100: 600, betragCent: 37500, art: 'Anteilig' });
  });

  it('mitten im Monat: Resttage anteilig', () => {
    const p = pos({ id: 2, jahrespreisCent: 2400, ende: '2027-09-30' });
    const r = proposeForPosition(p, [billed(2, '2026-03-15', '2027-03-14')], '2027-01-08');
    // 6 volle Monate (15.03.–14.09.) + 16/30
    expect(r.segments[0]).toMatchObject({ von: '2027-03-15', bis: '2027-09-30', monateX100: 653, betragCent: 1306 });
  });

  it('bis zum Ende verrechnet: entfällt', () => {
    const p = pos({ id: 1, ende: '2026-12-31' });
    expect(proposeForPosition(p, [billed(1, '2026-01-01', '2026-12-31')], '2027-01-08').status).toBe('entfaellt');
  });
});

describe('Lücke über mehrere Jahre', () => {
  it('es wird genau ein Zeitraum ab „verrechnet bis“ vorgeschlagen, ohne Lücke', () => {
    const p = pos({ id: 1, jahrespreisCent: 1200 });
    const r = proposeForPosition(p, [billed(1, '2020-01-01', '2023-12-31')], '2027-01-08');
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ von: '2024-01-01', bis: '2024-12-31', betragCent: 1200 });
  });

  it('ein manuell verlängerter Zeitraum über 3 Jahre wird korrekt berechnet', () => {
    const p = pos({ id: 1, jahrespreisCent: 1200 });
    expect(computeLine(p, '2024-01-01', '2026-12-31')).toEqual({ monateX100: 3600, betragCent: 3600 });
  });
});

describe('Schaltjahr', () => {
  it('01.03.2027–29.02.2028 sind genau 12 Monate', () => {
    expect(computeLine(pos({ id: 1, jahrespreisCent: 1200 }), '2027-03-01', '2028-02-29')).toEqual({ monateX100: 1200, betragCent: 1200 });
  });

  it('Jahrestag 15.02. über ein Schaltjahr: 12 Monate', () => {
    const p = pos({ id: 1 });
    const r = proposeForPosition(p, [billed(1, '2026-02-15', '2027-02-14')], '2027-01-08');
    expect(r.segments[0]).toMatchObject({ von: '2027-02-15', bis: '2028-02-14', monateX100: 1200 });
  });

  it('Start am 29.02.: Raster bleibt am ersten verrechneten Tag ausgerichtet', () => {
    const p = pos({ id: 1 });
    const lines = [billed(1, '2024-02-29', '2025-02-27'), billed(1, '2025-02-28', '2026-02-27')];
    const r = proposeForPosition(p, lines, '2026-01-08');
    expect(r.segments[0]).toMatchObject({ von: '2026-02-28', bis: '2027-02-27', monateX100: 1200 });
  });
});

describe('Monatsende (31.01. plus 1 Monat)', () => {
  it('Laufzeit 1 Monat ab 31.01.: kein Drift', () => {
    const p = pos({ id: 1, jahrespreisCent: 1200, laufzeitMonate: 1 });
    const r1 = proposeForPosition(p, [billed(1, '2027-01-31', '2027-02-27')], '2027-02-01');
    expect(r1.segments[0]).toMatchObject({ von: '2027-02-28', bis: '2027-03-30', monateX100: 100, betragCent: 100 });
    const r2 = proposeForPosition(p, [billed(1, '2027-01-31', '2027-02-27'), billed(1, '2027-02-28', '2027-03-30')], '2027-02-01');
    expect(r2.segments[0]).toMatchObject({ von: '2027-03-31', bis: '2027-04-29', monateX100: 100 });
  });
});
