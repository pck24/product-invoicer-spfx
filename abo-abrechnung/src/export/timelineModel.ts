/** Gemeinsames Modell der Zeitleiste einer Rechnung (Bildschirm und Word/PDF). */
import { maxIso, minIso } from '../billing/dates';
import { isActiveLine } from '../billing/proposal';
import { IBilledLine, ISODate } from '../billing/types';
import { IPositionItem, IRechnung, IRechnungsposition } from '../data/mapping';

export interface ITimelineBarModel {
  key: string;
  von: ISODate;
  bis: ISODate;
  /** gehört zu dieser Rechnung */
  current: boolean;
  rechnungsnummer: string;
  entwurf: boolean;
  betragCent: number;
}

export interface ITimelineRowModel {
  key: string;
  title: string;
  /** Kündigungsdatum */
  ende: ISODate | null;
  bars: ITimelineBarModel[];
}

/**
 * Eine Zeile je Position dieser Rechnung mit allen verrechneten Zeiträumen
 * (Entwurf/Erstellt anderer Rechnungen sowie diese Rechnung selbst, auch wenn storniert).
 */
export function timelineRows(rechnung: IRechnung, lines: IRechnungsposition[], positionen: IPositionItem[], billedLines: IBilledLine[]): ITimelineRowModel[] {
  const positionIds = lines.map((l) => l.positionId).filter((id, i, a): id is number => id !== null && a.indexOf(id) === i);
  return positionIds.map((pid) => {
    const pos = positionen.filter((p) => p.id === pid)[0];
    const bars = billedLines
      .filter((b) => b.positionId === pid && !!b.von && !!b.bis && (isActiveLine(b) || b.rechnungId === rechnung.id))
      .map((b) => ({
        key: `${b.rechnungId}-${b.von}`,
        von: b.von as ISODate,
        bis: b.bis as ISODate,
        current: b.rechnungId === rechnung.id,
        rechnungsnummer: b.rechnungsnummer || '',
        entwurf: b.status === 'Entwurf',
        betragCent: b.betragCent || 0
      }));
    const title = pos ? pos.title : lines.filter((l) => l.positionId === pid)[0].title;
    return { key: String(pid), title, ende: pos ? pos.ende : null, bars };
  });
}

/** Darstellungsbereich: ganze Kalenderjahre, höchstens 5, endend mit dem spätesten Datum. */
export function timelineRange(rows: { bars: { von: ISODate; bis: ISODate }[] }[], markerDate: ISODate): { startYear: number; endYear: number } {
  let min = markerDate;
  let max = markerDate;
  for (const r of rows) {
    for (const b of r.bars) {
      min = minIso(min, b.von);
      max = maxIso(max, b.bis);
    }
  }
  const endYear = Number(max.substring(0, 4));
  return { startYear: Math.max(Number(min.substring(0, 4)), endYear - 4), endYear };
}
