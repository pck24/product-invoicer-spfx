import { IBilledLine, IPosition } from '../types';

export function pos(p: Partial<IPosition> & { id: number }): IPosition {
  return {
    title: `Position ${p.id}`,
    menge: 1,
    jahrespreisCent: 12000,
    laufzeitMonate: 12,
    ende: null,
    ...p
  };
}

export function billed(positionId: number, von: string, bis: string, status: IBilledLine['status'] = 'Erstellt', rechnungsnummer = 'RE-ALT'): IBilledLine {
  return { positionId, von, bis, status, rechnungsnummer };
}

/** Referenzbeispiel Bäckerei Huber, Rechnung vom 08.01.2027 */
export const HUBER_DATUM = '2027-01-08';

export const huberPositions: IPosition[] = [
  pos({ id: 1, title: 'Microsoft 365 Business Standard', menge: 5, jahrespreisCent: 15000 }),
  pos({ id: 2, title: 'Domain huber-baeckerei.at', jahrespreisCent: 2400 }),
  pos({ id: 3, title: 'Domain huber.com', jahrespreisCent: 1800, laufzeitMonate: 24 }),
  pos({ id: 4, title: 'Cloud-Backup 100 GB', jahrespreisCent: 11880 }),
  pos({ id: 5, title: 'SSL-Zertifikat Wildcard', jahrespreisCent: 8900, ende: '2026-06-30' })
];

export const huberLines: IBilledLine[] = [
  billed(1, '2026-01-01', '2026-12-31', 'Erstellt', 'RE-2026-004'),
  billed(2, '2026-03-15', '2027-03-14', 'Erstellt', 'RE-2026-004'),
  billed(3, '2026-09-01', '2028-08-31', 'Erstellt', 'RE-2026-004'),
  billed(5, '2025-07-01', '2026-06-30', 'Erstellt', 'RE-2025-007')
];
