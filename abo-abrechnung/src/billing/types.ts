/** Kalendertag im Format YYYY-MM-DD, ohne Uhrzeit. */
export type ISODate = string;

export type Preisbasis = 'Monat' | 'Laufzeit';
export type Abrechnungsmodus = 'Stichtag' | 'Laufzeit';
export type Art = 'Folgezeitraum' | 'Anteilig' | 'Nachverrechnung' | 'Einmalig';
export type RechnungsStatus = 'Entwurf' | 'Erstellt' | 'Storniert';

export interface IPosition {
  id: number;
  title: string;
  menge: number;
  /** Preis in Cent, je Monat oder je Laufzeit (siehe preisbasis). */
  preisCent: number;
  preisbasis: Preisbasis;
  laufzeitMonate: number;
  modus: Abrechnungsmodus;
  beginn: ISODate;
  /** null = aktiv, unbegrenzt */
  ende: ISODate | null;
}

/** Bereits gespeicherte Rechnungsposition mit dem Status ihrer Rechnung. */
export interface IBilledLine {
  positionId: number | null;
  von: ISODate | null;
  bis: ISODate | null;
  status: RechnungsStatus;
  rechnungId?: number;
  rechnungsnummer?: string;
  betragCent?: number;
}
