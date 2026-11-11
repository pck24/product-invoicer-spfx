/** Kalendertag im Format YYYY-MM-DD, ohne Uhrzeit. */
export type ISODate = string;

export type Art = 'Folgezeitraum' | 'Anteilig' | 'Nachverrechnung' | 'Einmalig';
export type RechnungsStatus = 'Entwurf' | 'Erstellt' | 'Storniert';

export interface IPosition {
  id: number;
  title: string;
  menge: number;
  /** Jahrespreis in Cent; der Betrag ergibt sich anteilig aus den Monaten. */
  jahrespreisCent: number;
  /** Länge eines Folgezeitraums in Monaten (Standard 12). */
  laufzeitMonate: number;
  /** Leistungsende (nur über "Kündigen" gesetzt); null = aktiv */
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
