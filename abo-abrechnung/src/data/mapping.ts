/** Umwandlung zwischen SharePoint-Listenelementen und dem Domänenmodell (ohne SharePoint-Abhängigkeit). */
import { modusFor } from '../billing/proposal';
import { Art, IBilledLine, IPosition, ISODate, RechnungsStatus } from '../billing/types';

export interface IKunde {
  id: number;
  name: string;
  kundennummer: string;
  adresse: string;
  stichtagMonat: number;
  aktiv: boolean;
}

export interface IPositionItem extends IPosition {
  kundeId: number;
}

export interface IRechnung {
  id: number;
  nummer: string;
  kundeId: number | null;
  rechnungsdatum: ISODate | null;
  stichtag: ISODate | null;
  vorgaengerId: number | null;
  status: RechnungsStatus;
  summeNettoCent: number;
  pdfUrl: string | null;
}

export interface IRechnungsposition {
  id: number;
  rechnungId: number | null;
  positionId: number | null;
  title: string;
  von: ISODate | null;
  bis: ISODate | null;
  monateX100: number;
  menge: number;
  einzelpreisCent: number;
  betragCent: number;
  art: Art;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SPItem = Record<string, any>;

/**
 * Datumsfelder sind "DateOnly". SharePoint speichert sie als Mitternacht in der
 * Zeitzone der Site und liefert sie in UTC (z. B. 2026-12-31T23:00:00Z für den
 * 01.01.2027 in Wien). Geschrieben wird daher 12:00 UTC, gelesen wird auf den
 * nächstgelegenen Tag gerundet (+12 h, Datumsteil). Gilt für Zeitzonen bis ±11 h.
 */
export function toSpDate(value: ISODate | null): string | null {
  return value ? `${value}T12:00:00Z` : null;
}

export function fromSpDate(value: string | null | undefined): ISODate | null {
  if (!value) return null;
  const ms = Date.parse(value);
  if (isNaN(ms)) return null;
  return new Date(ms + 12 * 3600 * 1000).toISOString().substring(0, 10);
}

export function toCent(euro: number | null | undefined): number {
  return euro === null || euro === undefined ? 0 : Math.round(euro * 100);
}

export const KUNDE_FIELDS = ['Id', 'Title', 'Kundennummer', 'Adresse', 'StichtagMonat', 'Aktiv'];
export const POSITION_FIELDS = ['Id', 'Title', 'KundeId', 'Menge', 'Preis', 'Preisbasis', 'LaufzeitMonate', 'Abrechnungsmodus', 'Beginn', 'Ende'];
export const RECHNUNG_FIELDS = ['Id', 'Title', 'KundeId', 'Rechnungsdatum', 'Stichtag', 'VorgaengerId', 'Status', 'SummeNettoCent', 'PdfLink'];
export const RECHNUNGSPOSITION_FIELDS = ['Id', 'Title', 'RechnungId', 'PositionId', 'Von', 'Bis', 'Monate', 'Menge', 'EinzelpreisCent', 'BetragCent', 'Art'];

export function kundeFromItem(i: SPItem): IKunde {
  return {
    id: i.Id,
    name: i.Title || '',
    kundennummer: i.Kundennummer || '',
    adresse: i.Adresse || '',
    stichtagMonat: i.StichtagMonat || 1,
    aktiv: i.Aktiv !== false
  };
}

export function kundeToItem(k: Omit<IKunde, 'id'>): SPItem {
  return { Title: k.name, Kundennummer: k.kundennummer, Adresse: k.adresse, StichtagMonat: k.stichtagMonat, Aktiv: k.aktiv };
}

export function positionFromItem(i: SPItem): IPositionItem {
  const preisbasis = i.Preisbasis === 'Laufzeit' ? 'Laufzeit' : 'Monat';
  return {
    id: i.Id,
    kundeId: i.KundeId,
    title: i.Title || '',
    menge: i.Menge === null || i.Menge === undefined ? 1 : i.Menge,
    preisCent: toCent(i.Preis),
    preisbasis,
    laufzeitMonate: i.LaufzeitMonate || 1,
    // Der Modus folgt immer der Preisbasis (siehe DECISIONS.md); die Spalte dient nur der Transparenz.
    modus: modusFor(preisbasis),
    beginn: fromSpDate(i.Beginn) || '',
    ende: fromSpDate(i.Ende)
  };
}

export function positionToItem(p: Omit<IPositionItem, 'id'>): SPItem {
  return {
    Title: p.title,
    KundeId: p.kundeId,
    Menge: p.menge,
    Preis: p.preisCent / 100,
    Preisbasis: p.preisbasis,
    LaufzeitMonate: p.laufzeitMonate,
    Abrechnungsmodus: modusFor(p.preisbasis),
    Beginn: toSpDate(p.beginn),
    Ende: toSpDate(p.ende)
  };
}

function status(v: string): RechnungsStatus {
  return v === 'Erstellt' || v === 'Storniert' ? v : 'Entwurf';
}

export function rechnungFromItem(i: SPItem): IRechnung {
  return {
    id: i.Id,
    nummer: i.Title || '',
    kundeId: i.KundeId || null,
    rechnungsdatum: fromSpDate(i.Rechnungsdatum),
    stichtag: fromSpDate(i.Stichtag),
    vorgaengerId: i.VorgaengerId || null,
    status: status(i.Status),
    summeNettoCent: i.SummeNettoCent || 0,
    pdfUrl: (i.PdfLink && i.PdfLink.Url) || null
  };
}

export function rechnungToItem(r: Omit<IRechnung, 'id' | 'pdfUrl'>): SPItem {
  return {
    Title: r.nummer,
    KundeId: r.kundeId,
    Rechnungsdatum: toSpDate(r.rechnungsdatum),
    Stichtag: toSpDate(r.stichtag),
    VorgaengerId: r.vorgaengerId,
    Status: r.status,
    SummeNettoCent: r.summeNettoCent
  };
}

export function rechnungspositionFromItem(i: SPItem): IRechnungsposition {
  const art: Art = ['Folgezeitraum', 'Anteilig', 'Nachverrechnung'].indexOf(i.Art) >= 0 ? i.Art : 'Einmalig';
  return {
    id: i.Id,
    rechnungId: i.RechnungId || null,
    positionId: i.PositionId || null,
    title: i.Title || '',
    von: fromSpDate(i.Von),
    bis: fromSpDate(i.Bis),
    monateX100: Math.round((i.Monate || 0) * 100),
    menge: i.Menge === null || i.Menge === undefined ? 1 : i.Menge,
    einzelpreisCent: i.EinzelpreisCent || 0,
    betragCent: i.BetragCent || 0,
    art
  };
}

export function rechnungspositionToItem(r: Omit<IRechnungsposition, 'id'>): SPItem {
  return {
    Title: r.title,
    RechnungId: r.rechnungId,
    PositionId: r.positionId,
    Von: toSpDate(r.von),
    Bis: toSpDate(r.bis),
    Monate: r.monateX100 / 100,
    Menge: r.menge,
    EinzelpreisCent: r.einzelpreisCent,
    BetragCent: r.betragCent,
    Art: r.art
  };
}

/** Verknüpft Rechnungspositionen mit Status und Nummer ihrer Rechnung. */
export function toBilledLines(lines: IRechnungsposition[], rechnungen: IRechnung[]): IBilledLine[] {
  const byId: { [id: number]: IRechnung } = {};
  for (const r of rechnungen) byId[r.id] = r;
  const result: IBilledLine[] = [];
  for (const l of lines) {
    const r = l.rechnungId !== null ? byId[l.rechnungId] : undefined;
    if (!r) continue;
    result.push({ positionId: l.positionId, von: l.von, bis: l.bis, status: r.status, rechnungId: r.id, rechnungsnummer: r.nummer, betragCent: l.betragCent });
  }
  return result;
}
