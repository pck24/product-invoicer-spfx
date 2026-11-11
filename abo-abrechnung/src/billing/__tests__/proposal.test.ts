import { proposeForPosition, verrechnetBis, nextStart, computeLine, modusFor } from '../proposal';
import { billed, pos } from './fixtures';

describe('verrechnetBis / nextStart', () => {
  it('ignoriert stornierte Rechnungen', () => {
    const p = pos({ id: 1, beginn: '2025-01-01' });
    const lines = [billed(1, '2025-01-01', '2025-12-31'), billed(1, '2026-01-01', '2026-12-31', 'Storniert')];
    expect(verrechnetBis(1, lines)).toBe('2025-12-31');
    expect(nextStart(p, lines)).toBe('2026-01-01');
  });

  it('Entwürfe zählen als verrechnet', () => {
    expect(verrechnetBis(1, [billed(1, '2025-01-01', '2025-12-31', 'Entwurf')])).toBe('2025-12-31');
  });

  it('ohne Rechnung ist nextStart der Beginn', () => {
    expect(nextStart(pos({ id: 1, beginn: '2026-05-10' }), [])).toBe('2026-05-10');
  });
});

describe('Kündigung mitten im Zeitraum', () => {
  it('Stichtag-Modus: Segment endet am Leistungsende, anteilig', () => {
    const p = pos({ id: 1, menge: 5, preisCent: 1250, ende: '2027-06-30' });
    const r = proposeForPosition(p, [billed(1, '2026-01-01', '2026-12-31')], '2027-12-31');
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ von: '2027-01-01', bis: '2027-06-30', monateX100: 600, betragCent: 37500, art: 'Anteilig' });
  });

  it('Laufzeit-Modus: Segment wird auf das Leistungsende gekürzt', () => {
    const p = pos({ id: 2, preisCent: 2400, preisbasis: 'Laufzeit', laufzeitMonate: 12, modus: 'Laufzeit', beginn: '2023-03-15', ende: '2027-09-30' });
    const r = proposeForPosition(p, [billed(2, '2026-03-15', '2027-03-14')], '2027-12-31');
    expect(r.segments).toHaveLength(1);
    // 6 volle Monate (15.03.–14.09.) + 16/30 Tage
    expect(r.segments[0]).toMatchObject({ von: '2027-03-15', bis: '2027-09-30', monateX100: 653, betragCent: 1306 });
  });

  it('Kündigung vor dem nächsten offenen Tag: entfällt', () => {
    const p = pos({ id: 1, ende: '2026-12-31' });
    expect(proposeForPosition(p, [billed(1, '2026-01-01', '2026-12-31')], '2027-12-31').status).toBe('entfaellt');
  });

  it('Kündigung vor Abrechnungsjahr bei offener Vorperiode: nur anteiliges Vorsegment', () => {
    const p = pos({ id: 1, beginn: '2026-08-01', ende: '2026-10-31' });
    const r = proposeForPosition(p, [], '2027-12-31');
    expect(r.segments).toHaveLength(1);
    expect(r.segments[0]).toMatchObject({ von: '2026-08-01', bis: '2026-10-31', monateX100: 300, art: 'Anteilig' });
  });
});

describe('Lücke über mehrere Jahre', () => {
  it('Stichtag-Modus: eine Nachverrechnung plus Folgezeitraum', () => {
    const p = pos({ id: 1, preisCent: 1000, beginn: '2023-01-01' });
    const r = proposeForPosition(p, [], '2027-12-31');
    expect(r.segments).toHaveLength(2);
    expect(r.segments[0]).toMatchObject({ von: '2023-01-01', bis: '2026-12-31', monateX100: 4800, betragCent: 48000, art: 'Nachverrechnung' });
    expect(r.segments[1]).toMatchObject({ von: '2027-01-01', bis: '2027-12-31', art: 'Folgezeitraum' });
  });

  it('Laufzeit-Modus: erster Zeitraum Folgezeitraum, weitere Nachverrechnung', () => {
    const p = pos({ id: 2, preisCent: 2400, preisbasis: 'Laufzeit', laufzeitMonate: 12, modus: 'Laufzeit', beginn: '2020-03-15' });
    const r = proposeForPosition(p, [billed(2, '2023-03-15', '2024-03-14')], '2027-12-31');
    expect(r.segments.map((s) => [s.von, s.bis, s.art, s.betragCent])).toEqual([
      ['2024-03-15', '2025-03-14', 'Folgezeitraum', 2400],
      ['2025-03-15', '2026-03-14', 'Nachverrechnung', 2400],
      ['2026-03-15', '2027-03-14', 'Nachverrechnung', 2400],
      ['2027-03-15', '2028-03-14', 'Nachverrechnung', 2400]
    ]);
  });

  it('Anteilig bis 12 Monate zurück, Nachverrechnung darüber hinaus', () => {
    const anteilig = proposeForPosition(pos({ id: 1, beginn: '2026-01-01' }), [], '2027-12-31');
    expect(anteilig.segments[0].art).toBe('Anteilig');
    const nach = proposeForPosition(pos({ id: 1, beginn: '2025-12-31' }), [], '2027-12-31');
    expect(nach.segments[0].art).toBe('Nachverrechnung');
  });
});

describe('Schaltjahr', () => {
  it('Laufzeit ab 29.02.: jeder Zeitraum genau 12 Monate, kein Drift', () => {
    const p = pos({ id: 1, preisCent: 2400, preisbasis: 'Laufzeit', laufzeitMonate: 12, modus: 'Laufzeit', beginn: '2024-02-29' });
    const r = proposeForPosition(p, [], '2028-03-31');
    expect(r.segments.map((s) => [s.von, s.bis, s.monateX100, s.betragCent])).toEqual([
      ['2024-02-29', '2025-02-27', 1200, 2400],
      ['2025-02-28', '2026-02-27', 1200, 2400],
      ['2026-02-28', '2027-02-27', 1200, 2400],
      ['2027-02-28', '2028-02-28', 1200, 2400],
      ['2028-02-29', '2029-02-27', 1200, 2400]
    ]);
  });

  it('Februar im Schaltjahr hat 29 Tage', () => {
    const p = pos({ id: 1, preisCent: 2900 });
    expect(computeLine(p, '2028-02-01', '2028-02-29')).toEqual({ monateX100: 100, betragCent: 2900 });
    expect(computeLine(p, '2028-02-15', '2028-02-29')).toEqual({ monateX100: 52, betragCent: 1508 });
  });

  it('Domain mit Jahrestag im Februar über ein Schaltjahr: 12 Monate', () => {
    const p = pos({ id: 1, preisCent: 2400, preisbasis: 'Laufzeit', laufzeitMonate: 12, modus: 'Laufzeit', beginn: '2023-02-15' });
    expect(computeLine(p, '2027-02-15', '2028-02-14')).toEqual({ monateX100: 1200, betragCent: 2400 });
  });
});

describe('Monatsende (31.01. plus 1 Monat)', () => {
  it('Laufzeit 1 Monat ab 31.01.: Raster bleibt am Beginn ausgerichtet', () => {
    const p = pos({ id: 1, preisCent: 1000, preisbasis: 'Laufzeit', laufzeitMonate: 1, modus: 'Laufzeit', beginn: '2027-01-31' });
    const r = proposeForPosition(p, [], '2027-04-30');
    expect(r.segments.map((s) => [s.von, s.bis, s.monateX100, s.betragCent])).toEqual([
      ['2027-01-31', '2027-02-27', 100, 1000],
      ['2027-02-28', '2027-03-30', 100, 1000],
      ['2027-03-31', '2027-04-29', 100, 1000],
      ['2027-04-30', '2027-05-30', 100, 1000]
    ]);
  });

  it('Folgerechnung nach dem 28.02. schließt am Raster an', () => {
    const p = pos({ id: 1, preisbasis: 'Laufzeit', laufzeitMonate: 1, modus: 'Laufzeit', beginn: '2027-01-31' });
    const r = proposeForPosition(p, [billed(1, '2027-01-31', '2027-02-27')], '2027-03-15');
    expect(r.segments[0]).toMatchObject({ von: '2027-02-28', bis: '2027-03-30', monateX100: 100 });
  });
});

describe('Abrechnungsjahr ab April', () => {
  it('Anteiliges Vorsegment bis 31.03., dann volles Jahr April–März', () => {
    const p = pos({ id: 1, preisCent: 1000, beginn: '2026-10-01' });
    const r = proposeForPosition(p, [], '2028-03-31');
    expect(r.segments.map((s) => [s.von, s.bis, s.monateX100, s.art])).toEqual([
      ['2026-10-01', '2027-03-31', 600, 'Anteilig'],
      ['2027-04-01', '2028-03-31', 1200, 'Folgezeitraum']
    ]);
  });

  it('Beginn mitten im Monat innerhalb des Jahres: anteilig', () => {
    const p = pos({ id: 1, preisCent: 1000, beginn: '2027-08-15' });
    const r = proposeForPosition(p, [], '2028-03-31');
    expect(r.segments).toHaveLength(1);
    // 15.08.–14.03. = 7 Monate, 15.03.–31.03. = 17/31
    expect(r.segments[0]).toMatchObject({ von: '2027-08-15', bis: '2028-03-31', monateX100: 755, betragCent: 7550, art: 'Anteilig' });
  });
});

describe('modusFor', () => {
  it('pro Monat → Stichtag, pro Laufzeit → Laufzeit', () => {
    expect(modusFor('Monat')).toBe('Stichtag');
    expect(modusFor('Laufzeit')).toBe('Laufzeit');
  });
});
