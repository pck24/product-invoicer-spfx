/** Reine Ableitungen für die Oberfläche (ohne React und SharePoint). */
import { formatDate } from '../billing/dates';
import { formatEuro, formatMonate } from '../billing/money';
import { IPositionProposal, ISegment, nextStart, proposeForPosition, proposeInvoice } from '../billing/proposal';
import { IBilledLine, IPosition, ISODate } from '../billing/types';
import { IKunde, IPositionItem, IRechnung, neuesteZuerst } from '../data/mapping';

export type BadgeColor = 'warning' | 'danger' | 'success' | 'informative' | 'brand';

export const RECHNUNG_STATUS: { [k in IRechnung['status']]: BadgeColor } = { Entwurf: 'brand', Erstellt: 'success', Storniert: 'informative' };

export interface IStatusBadge {
  color: BadgeColor;
  text: string;
}

export interface ICustomerSummary {
  kunde: IKunde;
  positionen: IPositionItem[];
  proposals: IPositionProposal[];
  /** Vorschlag einer Folgerechnung mit heutigem Datum */
  segments: ISegment[];
  aktivePositionen: number;
  gekuendigtePositionen: number;
  letzteRechnung: IRechnung | undefined;
  status: IStatusBadge;
  /** offene Zeiträume: bereits laufend und nicht verrechnet, oder neue Positionen */
  offen: boolean;
  /** Folgerechnung möglich (es gibt etwas vorzuschlagen oder neu zu verrechnen) */
  rechnungMoeglich: boolean;
  /** frühester nächster Zeitraum einer bereits verrechneten Position */
  naechsterTermin: ISODate | null;
  vorschlagNettoCent: number;
}

/** Leistungsende liegt vor dem Bezugsdatum. */
export function isGekuendigt(p: IPosition, today: ISODate): boolean {
  return !!p.ende && p.ende < today;
}

export function summarizeCustomer(
  kunde: IKunde,
  positionen: IPositionItem[],
  rechnungen: IRechnung[],
  lines: IBilledLine[],
  today: ISODate
): ICustomerSummary {
  const proposal = proposeInvoice(positionen, lines, today);
  const gekuendigt = positionen.filter((p) => isGekuendigt(p, today)).length;
  const letzte = rechnungen
    .filter((r) => r.status !== 'Storniert')
    .sort(neuesteZuerst)[0];
  const laufend = proposal.positions.filter((p) => p.status === 'faellig' && !!p.nextStart && p.nextStart <= today);
  const neu = proposal.positions.filter((p) => p.status === 'neu' && !isGekuendigt(p.position, today));
  const laufendePositionen = proposal.positions.filter((p) => p.status === 'faellig' || p.status === 'nichtFaellig');
  const termine = laufendePositionen.map((p) => p.nextStart as ISODate).sort();
  let netto = 0;
  for (const p of laufend) for (const s of p.segments) netto += s.betragCent;

  let status: IStatusBadge;
  if (!kunde.aktiv) status = { color: 'informative', text: 'inaktiv' };
  else if (positionen.length === 0) status = { color: 'informative', text: 'keine Positionen' };
  else if (laufend.length > 0) status = { color: 'warning', text: `Fällig · ${laufend.length} ${laufend.length === 1 ? 'Zeitraum' : 'Zeiträume'}` };
  else if (neu.length > 0) status = { color: 'danger', text: 'Neue Position · Zeitraum offen' };
  else if (termine.length > 0) {
    const vb = laufendePositionen.map((p) => p.verrechnetBis as string).sort()[0];
    status = { color: 'success', text: `Verrechnet bis ${formatDate(vb)}` };
  } else status = { color: 'informative', text: 'gekündigt' };

  return {
    kunde,
    positionen,
    proposals: proposal.positions,
    segments: proposal.segments,
    aktivePositionen: positionen.length - gekuendigt,
    gekuendigtePositionen: gekuendigt,
    letzteRechnung: letzte,
    status,
    offen: kunde.aktiv && (laufend.length > 0 || neu.length > 0),
    rechnungMoeglich: kunde.aktiv && proposal.positions.some((p) => p.status !== 'entfaellt'),
    naechsterTermin: kunde.aktiv ? termine[0] || null : null,
    vorschlagNettoCent: kunde.aktiv ? netto : 0
  };
}

export interface IKpis {
  naechsterTermin: ISODate | null;
  offen: number;
  gesamt: number;
  vorschlagNettoCent: number;
}

export function kpis(summaries: ICustomerSummary[]): IKpis {
  const aktive = summaries.filter((s) => s.kunde.aktiv);
  const termine = aktive.map((s) => s.naechsterTermin).filter((t): t is ISODate => !!t).sort();
  let netto = 0;
  for (const s of aktive) netto += s.vorschlagNettoCent;
  return { naechsterTermin: termine[0] || null, offen: aktive.filter((s) => s.offen).length, gesamt: aktive.length, vorschlagNettoCent: netto };
}

/** "24,00 € / Jahr" */
export function preisText(p: IPosition): string {
  return `${formatEuro(p.jahrespreisCent)} / Jahr`;
}

export function laufzeitText(monate: number): string {
  return monate === 1 ? '1 Monat' : `${monate} Monate`;
}

export function monateText(monateX100: number): string {
  return `${formatMonate(monateX100)} ${monateX100 === 100 ? 'Monat' : 'Monate'}`;
}

/** Text für die Live-Vorschau im Positions-Drawer. */
export function previewText(position: IPosition, lines: IBilledLine[]): string {
  const start = nextStart(position, lines);
  if (start === null) return 'Noch nicht verrechnet. Den ersten Zeitraum legst du bei der Rechnung frei fest; danach schließen die Folgezeiträume automatisch an.';
  const r = proposeForPosition(position, lines, start);
  if (r.status === 'entfaellt') return 'Kein offener Zeitraum mehr – die Position ist bis zum Kündigungsdatum verrechnet.';
  const seg = r.segments[0];
  return `Nächster Zeitraum: ${formatDate(seg.von)} – ${formatDate(seg.bis)} (${monateText(seg.monateX100)}, ${formatEuro(seg.betragCent)}).`;
}

/** Text der Spalte "Nächster Zeitraum". */
export function naechsterZeitraum(p: IPositionProposal): { text: string; tone: 'due' | 'ok' | 'new' | 'none' } {
  if (p.status === 'entfaellt') return { text: 'entfällt', tone: 'none' };
  if (p.status === 'neu') return { text: 'bei erster Rechnung festlegen', tone: 'new' };
  if (p.status === 'nichtFaellig') return { text: `nicht fällig, ab ${formatDate(p.nextStart)}`, tone: 'ok' };
  const seg = p.segments[0];
  return { text: `${formatDate(seg.von)} – ${formatDate(seg.bis)}`, tone: 'due' };
}
