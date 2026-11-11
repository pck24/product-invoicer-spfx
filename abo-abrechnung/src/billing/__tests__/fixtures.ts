import { IBilledLine, IPosition } from '../types';

export function pos(p: Partial<IPosition> & { id: number }): IPosition {
  return {
    title: `Position ${p.id}`,
    menge: 1,
    preisCent: 1000,
    preisbasis: 'Monat',
    laufzeitMonate: 1,
    modus: 'Stichtag',
    beginn: '2024-01-01',
    ende: null,
    ...p
  };
}

export function billed(positionId: number, von: string, bis: string, status: IBilledLine['status'] = 'Erstellt', rechnungsnummer = 'RE-ALT'): IBilledLine {
  return { positionId, von, bis, status, rechnungsnummer };
}

/** Referenzbeispiel Bäckerei Huber, Stichtag 31.12.2027 */
export const HUBER_STICHTAG = '2027-12-31';

export const huberPositions: IPosition[] = [
  pos({ id: 1, title: 'Microsoft 365 Business Standard', menge: 5, preisCent: 1250, preisbasis: 'Monat', laufzeitMonate: 12, modus: 'Stichtag', beginn: '2024-01-01' }),
  pos({ id: 2, title: 'Domain huber-baeckerei.at', preisCent: 2400, preisbasis: 'Laufzeit', laufzeitMonate: 12, modus: 'Laufzeit', beginn: '2023-03-15' }),
  pos({ id: 3, title: 'Domain huber.com', preisCent: 3600, preisbasis: 'Laufzeit', laufzeitMonate: 24, modus: 'Laufzeit', beginn: '2022-09-01' }),
  pos({ id: 4, title: 'Cloud-Backup 100 GB', preisCent: 990, preisbasis: 'Monat', laufzeitMonate: 1, modus: 'Stichtag', beginn: '2026-08-01' }),
  pos({ id: 5, title: 'SSL-Zertifikat Wildcard', preisCent: 8900, preisbasis: 'Laufzeit', laufzeitMonate: 12, modus: 'Laufzeit', beginn: '2021-07-01', ende: '2026-06-30' })
];

export const huberLines: IBilledLine[] = [
  billed(1, '2026-01-01', '2026-12-31', 'Erstellt', 'RE-2026-004'),
  billed(2, '2026-03-15', '2027-03-14', 'Erstellt', 'RE-2026-004'),
  billed(3, '2026-09-01', '2028-08-31', 'Erstellt', 'RE-2026-004'),
  billed(5, '2025-07-01', '2026-06-30', 'Erstellt', 'RE-2025-007')
];
