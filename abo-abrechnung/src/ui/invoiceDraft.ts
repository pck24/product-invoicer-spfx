/** Zustand und Berechnungen des Rechnungsdialogs (rein, ohne React und SharePoint). */
import { formatDate, isIsoDate } from '../billing/dates';
import { ITotals, totals } from '../billing/money';
import { artFor, computeLine, firstBilled, PositionStatus, proposeInvoice, statusFor } from '../billing/proposal';
import { Art, IBilledLine, IPosition, ISODate } from '../billing/types';
import { IDraftLine } from '../billing/validation';
import { IRechnungsposition } from '../data/mapping';

/** Positionszeilen tragen den Status des Vorschlags; einmalige Zeilen haben keine Position. */
export type RowKind = PositionStatus | 'einmalig';

export interface IDraftRow {
  key: string;
  kind: RowKind;
  /** null genau bei kind === 'einmalig' */
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
  /** 'hervorgehoben' für die erste Verrechnung, sonst 'normal' */
  hinweisTon: 'hervorgehoben' | 'normal';
  /** Zeile ist vollständig (Datum gültig bzw. Bezeichnung/Betrag bei einmaligen) */
  complete: boolean;
}

/** Einmal je Datenstand aufgebaut: Positionen nach Id und Raster-Anker je Position. */
export interface IDraftContext {
  positions: { [id: number]: IPosition };
  anchors: { [id: number]: ISODate | undefined };
}

export function draftContext(positions: IPosition[], lines: IBilledLine[]): IDraftContext {
  const ctx: IDraftContext = { positions: {}, anchors: {} };
  for (const p of positions) {
    ctx.positions[p.id] = p;
    ctx.anchors[p.id] = firstBilled(p.id, lines) || undefined;
  }
  return ctx;
}

/** Zeilen für alle Positionen: fällig, neu, nicht fällig, entfällt (in dieser Reihenfolge). */
export function buildRows(positions: IPosition[], lines: IBilledLine[], rechnungsdatum: ISODate): IDraftRow[] {
  return proposeInvoice(positions, lines, rechnungsdatum).map((r) => ({
    key: `p${r.position.id}`,
    kind: r.status,
    positionId: r.position.id,
    title: r.position.title,
    von: r.next ? r.next.von : '',
    bis: r.next ? r.next.bis : '',
    checked: r.status === 'faellig',
    touched: false,
    betragOverrideCent: null,
    nextStart: r.nextStart || undefined
  }));
}

/** Nach Änderung des Rechnungsdatums: Vorauswahl nicht angefasster Folgezeilen neu bestimmen. */
export function refreshDefaults(rows: IDraftRow[], rechnungsdatum: ISODate): IDraftRow[] {
  if (!isIsoDate(rechnungsdatum)) return rows;
  return rows.map((r) => {
    if ((r.kind !== 'faellig' && r.kind !== 'nichtFaellig') || !r.nextStart) return r;
    const kind = statusFor(r.nextStart, rechnungsdatum);
    return { ...r, kind, checked: r.touched ? r.checked : kind === 'faellig' };
  });
}

export function calcRow(row: IDraftRow, ctx: IDraftContext): IRowCalc {
  if (row.positionId === null) {
    const betrag = row.betragOverrideCent || 0;
    return {
      monateX100: 0,
      menge: 1,
      einzelpreisCent: betrag,
      betragCent: betrag,
      art: 'Einmalig',
      hinweis: 'einmalig',
      hinweisTon: 'normal',
      complete: !!row.title.trim() && row.betragOverrideCent !== null
    };
  }
  const p = ctx.positions[row.positionId];
  const datesOk = isIsoDate(row.von) && isIsoDate(row.bis) && row.bis >= row.von;
  const calc = datesOk ? computeLine(p, row.von, row.bis, ctx.anchors[p.id]) : { monateX100: 0, betragCent: 0 };
  const art: Art = datesOk ? artFor(p, row.bis, calc.monateX100) : 'Folgezeitraum';
  let hinweis: string;
  if (row.kind === 'entfaellt') hinweis = p.ende ? `entfällt, gekündigt zum ${formatDate(p.ende)}` : 'entfällt';
  else if (row.kind === 'neu') hinweis = 'erste Verrechnung – Zeitraum frei wählen';
  else if (art === 'Anteilig') hinweis = 'anteilig bis Kündigungsdatum';
  else if (row.kind === 'nichtFaellig') hinweis = `nicht fällig, beginnt ${formatDate(row.nextStart)}`;
  else hinweis = 'Folgezeitraum';
  return {
    monateX100: calc.monateX100,
    menge: p.menge,
    einzelpreisCent: p.jahrespreisCent,
    betragCent: row.betragOverrideCent !== null ? row.betragOverrideCent : calc.betragCent,
    art,
    hinweis,
    hinweisTon: row.kind === 'neu' ? 'hervorgehoben' : 'normal',
    complete: datesOk
  };
}

/** Berechnung aller Zeilen auf einmal (für Tabelle, Summen und Speichern). */
export function calcRows(rows: IDraftRow[], ctx: IDraftContext): { [key: string]: IRowCalc } {
  const result: { [key: string]: IRowCalc } = {};
  for (const r of rows) result[r.key] = calcRow(r, ctx);
  return result;
}

export function selectedRows(rows: IDraftRow[]): IDraftRow[] {
  return rows.filter((r) => r.checked && r.kind !== 'entfaellt');
}

export function draftTotals(rows: IDraftRow[], calcs: { [key: string]: IRowCalc }, ustSatz: number): ITotals {
  return totals(selectedRows(rows).map((r) => calcs[r.key].betragCent), ustSatz);
}

/** Zeilen für die Prüfung (validateInvoice). */
export function toValidationLines(rows: IDraftRow[]): IDraftLine[] {
  return selectedRows(rows).map((r) => ({
    key: r.key,
    positionId: r.positionId,
    title: r.title,
    von: r.von || null,
    bis: r.bis || null,
    betragCent: r.positionId === null ? r.betragOverrideCent : undefined
  }));
}

/** Zeilen zum Speichern. */
export function toSaveLines(rows: IDraftRow[], ctx: IDraftContext): Omit<IRechnungsposition, 'id' | 'rechnungId'>[] {
  return selectedRows(rows).map((r) => {
    const c = calcRow(r, ctx);
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
export function applyDraft(rows: IDraftRow[], draftLines: IRechnungsposition[], ctx: IDraftContext): IDraftRow[] {
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
      const computed = calcRow(updated, ctx).betragCent;
      return computed === l.betragCent ? updated : { ...updated, betragOverrideCent: l.betragCent };
    });
  }
  return result;
}
