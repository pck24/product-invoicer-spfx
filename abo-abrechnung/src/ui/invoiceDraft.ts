/** Zustand und Berechnungen des Rechnungsdialogs (rein, ohne React und SharePoint). */
import { formatDate, isIsoDate } from '../billing/dates';
import { totals, ITotals } from '../billing/money';
import { horizon } from '../billing/periods';
import { computeLine, firstBilled, proposeForPosition } from '../billing/proposal';
import { Art, IBilledLine, IPosition, ISODate } from '../billing/types';
import { IDraftLine } from '../billing/validation';
import { IRechnungsposition } from '../data/mapping';

export type RowKind = 'faellig' | 'neu' | 'nichtFaellig' | 'entfaellt' | 'einmalig';

export interface IDraftRow {
  key: string;
  kind: RowKind;
  positionId: number | null;
  title: string;
  /** YYYY-MM-DD oder '' */
  von: string;
  bis: string;
  checked: boolean;
  /** Häkchen wurde vom Benutzer gesetzt/entfernt → Vorauswahl nicht mehr automatisch ändern */
  touched: boolean;
  /** manuell geänderter Betrag; null = berechnet */
  betragOverrideCent: number | null;
  /** nächster offener Tag (nur Positionen) */
  nextStart?: ISODate;
}

export interface IRowCalc {
  monateX100: number;
  menge: number;
  einzelpreisCent: number;
  betragCent: number;
  art: Art;
  hinweis: string;
  /** Zeile ist vollständig (Datum gültig bzw. Bezeichnung/Betrag bei einmaligen) */
  complete: boolean;
}

function byId(positions: IPosition[]): { [id: number]: IPosition } {
  const m: { [id: number]: IPosition } = {};
  for (const p of positions) m[p.id] = p;
  return m;
}

/** Zeilen für alle Positionen: fällig, neu, nicht fällig, entfällt (in dieser Reihenfolge). */
export function buildRows(positions: IPosition[], lines: IBilledLine[], rechnungsdatum: ISODate): IDraftRow[] {
  const order: RowKind[] = ['faellig', 'neu', 'nichtFaellig', 'entfaellt'];
  const rows = positions.map((p) => {
    const r = proposeForPosition(p, lines, rechnungsdatum);
    const seg = r.segments[0];
    const row: IDraftRow = {
      key: `p${p.id}`,
      kind: r.status,
      positionId: p.id,
      title: p.title,
      von: seg ? seg.von : '',
      bis: seg ? seg.bis : '',
      checked: r.status === 'faellig',
      touched: false,
      betragOverrideCent: null,
      nextStart: r.nextStart
    };
    return row;
  });
  return rows.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

/** Nach Änderung des Rechnungsdatums: Vorauswahl nicht angefasster Folgezeilen neu bestimmen. */
export function refreshDefaults(rows: IDraftRow[], rechnungsdatum: ISODate): IDraftRow[] {
  if (!isIsoDate(rechnungsdatum)) return rows;
  const h = horizon(rechnungsdatum);
  return rows.map((r) => {
    if ((r.kind !== 'faellig' && r.kind !== 'nichtFaellig') || !r.nextStart) return r;
    const kind: RowKind = r.nextStart <= h ? 'faellig' : 'nichtFaellig';
    return { ...r, kind, checked: r.touched ? r.checked : kind === 'faellig' };
  });
}

export function calcRow(row: IDraftRow, positions: IPosition[], lines: IBilledLine[]): IRowCalc {
  if (row.positionId === null) {
    const betrag = row.betragOverrideCent || 0;
    return {
      monateX100: 0,
      menge: 1,
      einzelpreisCent: betrag,
      betragCent: betrag,
      art: 'Einmalig',
      hinweis: 'einmalig',
      complete: !!row.title.trim() && row.betragOverrideCent !== null
    };
  }
  const p = byId(positions)[row.positionId];
  const datesOk = isIsoDate(row.von) && isIsoDate(row.bis) && row.bis >= row.von;
  const calc = datesOk ? computeLine(p, row.von, row.bis, firstBilled(p.id, lines) || undefined) : { monateX100: 0, betragCent: 0 };
  const anteilig = datesOk && !!p.ende && row.bis === p.ende && calc.monateX100 < p.laufzeitMonate * 100;
  let hinweis: string;
  if (row.kind === 'entfaellt') hinweis = p.ende ? `entfällt, gekündigt zum ${formatDate(p.ende)}` : 'entfällt';
  else if (row.kind === 'neu') hinweis = 'erste Verrechnung – Zeitraum frei wählen';
  else if (anteilig) hinweis = 'anteilig bis Leistungsende';
  else if (row.kind === 'nichtFaellig') hinweis = `nicht fällig, beginnt ${formatDate(row.nextStart)}`;
  else hinweis = 'Folgezeitraum';
  return {
    monateX100: calc.monateX100,
    menge: p.menge,
    einzelpreisCent: p.jahrespreisCent,
    betragCent: row.betragOverrideCent !== null ? row.betragOverrideCent : calc.betragCent,
    art: anteilig ? 'Anteilig' : 'Folgezeitraum',
    hinweis,
    complete: datesOk
  };
}

export function selectedRows(rows: IDraftRow[]): IDraftRow[] {
  return rows.filter((r) => r.checked && r.kind !== 'entfaellt');
}

export function draftTotals(rows: IDraftRow[], positions: IPosition[], lines: IBilledLine[], ustSatz: number): ITotals {
  return totals(selectedRows(rows).map((r) => calcRow(r, positions, lines).betragCent), ustSatz);
}

/** Zeilen für die Prüfung (validateInvoice). */
export function toValidationLines(rows: IDraftRow[]): IDraftLine[] {
  return selectedRows(rows).map((r) => ({
    key: r.key,
    positionId: r.positionId,
    title: r.title,
    von: r.von || null,
    bis: r.bis || null
  }));
}

/** Zeilen zum Speichern. */
export function toSaveLines(rows: IDraftRow[], positions: IPosition[], lines: IBilledLine[]): Omit<IRechnungsposition, 'id' | 'rechnungId'>[] {
  return selectedRows(rows).map((r) => {
    const c = calcRow(r, positions, lines);
    return {
      positionId: r.positionId,
      title: r.title.trim(),
      von: r.von || null,
      bis: r.bis || null,
      monateX100: c.monateX100,
      menge: c.menge,
      einzelpreisCent: c.einzelpreisCent,
      betragCent: c.betragCent,
      art: c.art
    };
  });
}

/** Einen gespeicherten Entwurf in die Zeilen übernehmen (Zeilen vorher mit buildRows ohne den Entwurf erzeugt). */
export function applyDraft(rows: IDraftRow[], draftLines: IRechnungsposition[], positions: IPosition[], lines: IBilledLine[]): IDraftRow[] {
  let result = rows.map((r) => ({ ...r, checked: false, touched: true }));
  let n = 0;
  for (const l of draftLines) {
    if (l.positionId === null) {
      result = result.concat({
        key: `e${n++}`,
        kind: 'einmalig',
        positionId: null,
        title: l.title,
        von: l.von || '',
        bis: l.bis || '',
        checked: true,
        touched: true,
        betragOverrideCent: l.betragCent
      });
      continue;
    }
    result = result.map((r) => {
      if (r.positionId !== l.positionId) return r;
      const updated: IDraftRow = { ...r, von: l.von || '', bis: l.bis || '', checked: true, touched: true, betragOverrideCent: null };
      const computed = calcRow(updated, positions, lines).betragCent;
      return computed === l.betragCent ? updated : { ...updated, betragOverrideCent: l.betragCent };
    });
  }
  return result;
}
