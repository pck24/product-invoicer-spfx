import { sortRows } from '../useSort';

interface IRow {
  name: string;
  nr: string;
  betrag: number | null;
}

const rows: IRow[] = [
  { name: 'Zeller', nr: 'K-10', betrag: 500 },
  { name: 'ärztekammer', nr: 'K-2', betrag: null },
  { name: 'Bauer', nr: 'K-1', betrag: 1200 }
];
const cols = { name: (r: IRow) => r.name, nr: (r: IRow) => r.nr, betrag: (r: IRow) => r.betrag };

describe('sortRows', () => {
  it('ohne Sortierung bleibt die Reihenfolge', () => {
    expect(sortRows(rows, cols, undefined)).toBe(rows);
  });

  it('sortiert Text deutsch und ohne Groß-/Kleinschreibung', () => {
    expect(sortRows(rows, cols, { key: 'name', dir: 'ascending' }).map((r) => r.name)).toEqual(['ärztekammer', 'Bauer', 'Zeller']);
    expect(sortRows(rows, cols, { key: 'name', dir: 'descending' }).map((r) => r.name)).toEqual(['Zeller', 'Bauer', 'ärztekammer']);
  });

  it('sortiert Nummern natürlich (K-2 vor K-10)', () => {
    expect(sortRows(rows, cols, { key: 'nr', dir: 'ascending' }).map((r) => r.nr)).toEqual(['K-1', 'K-2', 'K-10']);
  });

  it('leere Werte stehen in beiden Richtungen am Ende', () => {
    expect(sortRows(rows, cols, { key: 'betrag', dir: 'ascending' }).map((r) => r.betrag)).toEqual([500, 1200, null]);
    expect(sortRows(rows, cols, { key: 'betrag', dir: 'descending' }).map((r) => r.betrag)).toEqual([1200, 500, null]);
  });
});
