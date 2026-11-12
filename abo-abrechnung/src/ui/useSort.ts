import * as React from 'react';

export type SortValue = string | number | null | undefined;
export type SortDirection = 'ascending' | 'descending';

export interface ISortState {
  key: string;
  dir: SortDirection;
}

const collator = new Intl.Collator('de', { numeric: true, sensitivity: 'base' });

/** Vergleicht zwei Werte: Text nach deutscher Sortierung (K-2 vor K-10), Zahlen numerisch, leere Werte immer zuletzt. */
export function compareValues(a: SortValue, b: SortValue, dir: SortDirection): number {
  const emptyA = a === null || a === undefined || a === '';
  const emptyB = b === null || b === undefined || b === '';
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1;
  const c = typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b));
  return dir === 'ascending' ? c : -c;
}

/** Sortiert stabil nach einer Spalte (ohne Sortierung bleibt die übergebene Reihenfolge). */
export function sortRows<T>(rows: T[], columns: Record<string, (row: T) => SortValue>, sort: ISortState | undefined): T[] {
  const value = sort && columns[sort.key];
  if (!sort || !value) return rows;
  return rows
    .map((row, i) => ({ row, i, v: value(row) }))
    .sort((a, b) => compareValues(a.v, b.v, sort.dir) || a.i - b.i)
    .map((x) => x.row);
}

export interface ISortableHeader {
  sortDirection: SortDirection | undefined;
  onClick: () => void;
}

/**
 * Sortierung per Klick auf den Spaltenkopf: 1. Klick aufsteigend, 2. absteigend,
 * 3. zurück zur Standardreihenfolge.
 */
export function useSort<T>(
  rows: T[],
  columns: Record<string, (row: T) => SortValue>
): { sorted: T[]; header: (key: string) => ISortableHeader } {
  const [sort, setSort] = React.useState<ISortState | undefined>();
  // columns sind reine Zugriffsfunktionen und werden je Render neu angelegt → nicht in den Abhängigkeiten
  const sorted = React.useMemo(() => sortRows(rows, columns, sort), [rows, sort]);
  const header = (key: string): ISortableHeader => ({
    sortDirection: sort && sort.key === key ? sort.dir : undefined,
    onClick: () =>
      setSort((s) => (!s || s.key !== key ? { key, dir: 'ascending' } : s.dir === 'ascending' ? { key, dir: 'descending' } : undefined))
  });
  return { sorted, header };
}
