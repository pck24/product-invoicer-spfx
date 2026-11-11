/** Reine Ableitungen für die Oberfläche (ohne React und SharePoint). */
import { addDaysIso, addMonthsIso, formatDate, pad2 } from '../billing/dates';
import { formatEuro, formatMonate } from '../billing/money';
import { billingYear, defaultStichtag } from '../billing/periods';
import { IPositionProposal, ISegment, nextStart, proposeForPosition, proposeInvoice } from '../billing/proposal';
import { IBilledLine, IPosition, ISODate } from '../billing/types';
import { IKunde, IPositionItem, IRechnung } from '../data/mapping';

export type BadgeColor = 'warning' | 'danger' | 'success' | 'informative' | 'brand';

export interface IStatusBadge {
  color: BadgeColor;
  text: string;
}

export interface ICustomerSummary {
  kunde: IKunde;
  positionen: IPositionItem[];
  stichtag: ISODate;
  proposals: IPositionProposal[];
  segments: ISegment[];
  aktivePositionen: number;
  gekuendigtePositionen: number;
  letzteRechnung: IRechnung | undefined;
  status: IStatusBadge;
  faellig: boolean;
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
  const stichtag = defaultStichtag(kunde.stichtagMonat, today);
  const proposal = proposeInvoice(positionen, lines, stichtag);
  const gekuendigt = positionen.filter((p) => isGekuendigt(p, today)).length;
  const letzte = rechnungen
    .filter((r) => r.status !== 'Storniert')
    .sort((a, b) => (b.rechnungsdatum || '').localeCompare(a.rechnungsdatum || '') || b.id - a.id)[0];
  const due = proposal.positions.filter((p) => p.status === 'faellig');
  let netto = 0;
  for (const s of proposal.segments) netto += s.betragCent;

  let status: IStatusBadge;
  if (!kunde.aktiv) status = { color: 'informative', text: 'inaktiv' };
  else if (positionen.length === 0) status = { color: 'informative', text: 'keine Positionen' };
  else if (due.length > 0 && due.every((p) => p.verrechnetBis === null)) status = { color: 'danger', text: 'Neue Position · anteilig offen' };
  else if (due.length > 0) {
    const n = proposal.segments.length;
    status = { color: 'warning', text: `Fällig · ${n} ${n === 1 ? 'Zeitraum' : 'Zeiträume'}` };
  } else {
    const offen = proposal.positions.filter((p) => p.status === 'nichtFaellig' && p.verrechnetBis);
    if (offen.length === 0) status = { color: 'informative', text: 'gekündigt' };
    else {
      const min = offen.map((p) => p.verrechnetBis as string).sort()[0];
      status = { color: 'success', text: `Verrechnet bis ${formatDate(min)}` };
    }
  }

  return {
    kunde,
    positionen,
    stichtag,
    proposals: proposal.positions,
    segments: proposal.segments,
    aktivePositionen: positionen.length - gekuendigt,
    gekuendigtePositionen: gekuendigt,
    letzteRechnung: letzte,
    status,
    faellig: kunde.aktiv && proposal.segments.length > 0,
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
  const faellig = aktive.filter((s) => s.faellig);
  const termine = faellig.map((s) => billingYear(s.stichtag).start).sort();
  let netto = 0;
  for (const s of faellig) netto += s.vorschlagNettoCent;
  return { naechsterTermin: termine[0] || null, offen: faellig.length, gesamt: aktive.length, vorschlagNettoCent: netto };
}

/** "Abrechnung jährlich zum 01.04." */
export function stichtagText(monat: number): string {
  return `01.${pad2(monat || 1)}.`;
}

export const MONATE = ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** "12,50 € / Mon.", "24,00 € / Jahr", "36,00 € / 2 Jahre", "5,00 € / 3 Mon." */
export function preisText(p: IPosition): string {
  const preis = formatEuro(p.preisCent);
  if (p.preisbasis === 'Monat') return `${preis} / Mon.`;
  const l = p.laufzeitMonate;
  if (l === 12) return `${preis} / Jahr`;
  if (l % 12 === 0) return `${preis} / ${l / 12} Jahre`;
  return `${preis} / ${l} Mon.`;
}

export function laufzeitText(monate: number): string {
  return monate === 1 ? '1 Monat' : `${monate} Monate`;
}

/** Ende des Abrechnungsjahres, das das Datum enthält. */
export function billingYearEndContaining(date: ISODate, stichtagMonat: number): ISODate {
  const y = Number(date.substring(0, 4));
  let start = `${y}-${pad2(stichtagMonat || 1)}-01`;
  if (start > date) start = `${y - 1}-${pad2(stichtagMonat || 1)}-01`;
  return addDaysIso(addMonthsIso(start, 12), -1);
}

/** Text für die Live-Vorschau im Positions-Drawer. */
export function previewText(position: IPosition, lines: IBilledLine[], stichtagMonat: number): string {
  const start = nextStart(position, lines);
  if (position.ende && start > position.ende) return 'Kein offener Zeitraum mehr – die Position ist bis zum Leistungsende verrechnet.';
  const s = billingYearEndContaining(start, stichtagMonat);
  const r = proposeForPosition(position, lines, s);
  const seg = r.segments[0];
  if (!seg) return '';
  const prefix = r.verrechnetBis ? 'Nächster Zeitraum' : 'Wird erstmals verrechnet';
  const art = seg.art === 'Folgezeitraum' ? (position.modus === 'Laufzeit' ? 'im Voraus' : 'volles Jahr') : seg.art.toLowerCase();
  const danach =
    position.modus === 'Laufzeit'
      ? `danach alle ${laufzeitText(position.laufzeitMonate)} im Voraus`
      : `danach jährlich zum ${stichtagText(stichtagMonat)}`;
  const ende = position.ende && seg.bis >= position.ende ? ', danach endet die Leistung' : `, ${danach}`;
  const text = `${prefix}: ${formatDate(seg.von)} – ${formatDate(seg.bis)} (${art}, ${formatMonate(seg.monateX100)} ${seg.monateX100 === 100 ? 'Monat' : 'Monate'}, ${formatEuro(seg.betragCent)})${ende}`;
  return text.charAt(text.length - 1) === '.' ? text : `${text}.`;
}

/** Text der Spalte "Nächster Zeitraum". */
export function naechsterZeitraum(p: IPositionProposal): { text: string; tone: 'due' | 'ok' | 'none' } {
  if (p.status === 'entfaellt') return { text: 'entfällt', tone: 'none' };
  if (p.status === 'nichtFaellig') return { text: 'nicht fällig', tone: 'ok' };
  const segs = p.segments;
  return { text: `${formatDate(segs[0].von)} – ${formatDate(segs[segs.length - 1].bis)}`, tone: 'due' };
}
