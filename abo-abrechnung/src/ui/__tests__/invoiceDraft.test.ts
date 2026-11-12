import { HUBER_DATUM, huberLines, huberPositions } from '../../billing/__tests__/fixtures';
import { hasErrors, validateInvoice } from '../../billing/validation';
import { applyDraft, buildRows, calcRow, calcRows, draftContext, draftTotals, IDraftRow, refreshDefaults, toSaveLines, toValidationLines } from '../invoiceDraft';

describe('Rechnungsdialog', () => {
  const rows = buildRows(huberPositions, huberLines, HUBER_DATUM);
  const ctx = draftContext(huberPositions, huberLines);
  const sum = (rs: IDraftRow[]): number => draftTotals(rs, calcRows(rs, ctx), 20).nettoCent;

  it('Zeilen: fällige angehakt und vorbefüllt, neue leer, Rest ohne Häkchen', () => {
    expect(rows.map((r) => [r.title, r.kind, r.checked, r.von, r.bis])).toEqual([
      ['Microsoft 365 Business Standard', 'faellig', true, '2027-01-01', '2027-12-31'],
      ['Domain huber-baeckerei.at', 'faellig', true, '2027-03-15', '2028-03-14'],
      ['Cloud-Backup 100 GB', 'neu', false, '', ''],
      ['Domain huber.com', 'nichtFaellig', false, '2028-09-01', '2030-08-31'],
      ['SSL-Zertifikat Wildcard', 'entfaellt', false, '', '']
    ]);
  });

  it('Huber end-to-end: Cloud-Backup manuell, Summen auf den Cent', () => {
    const filled: IDraftRow[] = rows.map((r) => (r.positionId === 4 ? { ...r, von: '2026-08-01', bis: '2027-12-31', checked: true } : r));
    expect(draftTotals(filled, calcRows(filled, ctx), 20)).toEqual({ nettoCent: 94230, ustCent: 18846, bruttoCent: 113076 });
    const issues = validateInvoice({
      invoiceNumber: '2027-001',
      existingInvoiceNumbers: ['RE-2026-004'],
      lines: toValidationLines(filled),
      positions: huberPositions,
      billedLines: huberLines
    });
    expect(issues).toEqual([]);
    const save = toSaveLines(filled, ctx);
    expect(save.map((l) => [l.positionId, l.von, l.bis, l.monateX100, l.betragCent, l.art])).toEqual([
      [1, '2027-01-01', '2027-12-31', 1200, 75000, 'Folgezeitraum'],
      [2, '2027-03-15', '2028-03-14', 1200, 2400, 'Folgezeitraum'],
      [4, '2026-08-01', '2027-12-31', 1700, 16830, 'Folgezeitraum']
    ]);
  });

  it('nicht fällige Zeile kann dazugenommen werden', () => {
    const plus = rows.map((r) => (r.positionId === 3 ? { ...r, checked: true, touched: true } : r));
    expect(sum(plus)).toBe(75000 + 2400 + 3600);
  });

  it('Rechnungsdatum ändern: Vorauswahl folgt, außer der Benutzer hat das Häkchen gesetzt', () => {
    const later = refreshDefaults(rows, '2028-07-01');
    expect(later.filter((r) => r.positionId === 3)[0]).toMatchObject({ kind: 'faellig', checked: true });
    const earlier = refreshDefaults(rows, '2026-10-01');
    expect(earlier.filter((r) => r.positionId === 2)[0]).toMatchObject({ kind: 'nichtFaellig', checked: false });
    const touched = rows.map((r) => (r.positionId === 2 ? { ...r, touched: true } : r));
    expect(refreshDefaults(touched, '2026-10-01').filter((r) => r.positionId === 2)[0].checked).toBe(true);
  });

  it('manueller Betrag und einmalige Position', () => {
    const r = rows[0];
    expect(calcRow({ ...r, betragOverrideCent: 70000 }, ctx).betragCent).toBe(70000);
    const e: IDraftRow = { key: 'e0', kind: 'einmalig', positionId: null, title: 'Einrichtung', von: '', bis: '', checked: true, touched: true, betragOverrideCent: 12000 };
    expect(calcRow(e, ctx)).toMatchObject({ betragCent: 12000, art: 'Einmalig', complete: true });
  });

  it('Überschneidung durch manuelle Änderung wird erkannt', () => {
    const bad = rows.map((r) => (r.positionId === 1 ? { ...r, von: '2026-12-01' } : r));
    expect(hasErrors(validateInvoice({ invoiceNumber: 'X', existingInvoiceNumbers: [], lines: toValidationLines(bad), positions: huberPositions, billedLines: huberLines }))).toBe(true);
  });

  it('Entwurf wieder öffnen: Zeiträume und abweichender Betrag werden übernommen', () => {
    const draft = applyDraft(
      rows,
      [
        { id: 1, rechnungId: 9, positionId: 1, title: 'M365', von: '2027-01-01', bis: '2027-12-31', monateX100: 1200, menge: 5, einzelpreisCent: 15000, betragCent: 70000, art: 'Folgezeitraum' },
        { id: 2, rechnungId: 9, positionId: null, title: 'Einrichtung', von: null, bis: null, monateX100: 0, menge: 1, einzelpreisCent: 5000, betragCent: 5000, art: 'Einmalig' }
      ],
      ctx
    );
    expect(draft.filter((r) => r.checked).map((r) => [r.title, r.betragOverrideCent])).toEqual([
      ['Microsoft 365 Business Standard', 70000],
      ['Einrichtung', 5000]
    ]);
  });
});
