import * as React from 'react';
import { Link, Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, mergeClasses } from '@fluentui/react-components';
import { formatDate } from '../../billing/dates';
import { formatEuro } from '../../billing/money';
import { IRechnung } from '../../data/mapping';
import { useData } from '../DataContext';
import { anzahlText, RECHNUNG_STATUS } from '../derive';
import { rowClick } from '../rowClick';
import { useShared } from '../styles';
import { InvoiceActions } from './InvoiceActions';
import { StatusBadge } from './StatusBadge';

export interface IRechnungenTableProps {
  rechnungen: IRechnung[];
  /** Spalte "Kunde" mit Link (Tab "Rechnungen") */
  onOpenKunde?: (kundeId: number) => void;
  onShow: (rechnung: IRechnung) => void;
  onEditDraft: (rechnung: IRechnung) => void;
  emptyText: string;
}

/** Rechnungsliste mit klickbaren Zeilen und Aktionsmenü (Kundendetail und Tab "Rechnungen"). */
export function RechnungenTable({ rechnungen, onOpenKunde, onShow, onEditDraft, emptyText }: IRechnungenTableProps): React.ReactElement {
  const shared = useShared();
  const { data } = useData();
  const cols = onOpenKunde ? 7 : 6;
  return (
    <div className={shared.tableWrap}>
      <Table className={shared.table} aria-label="Rechnungen">
        <TableHeader>
          <TableRow>
            <TableHeaderCell>Nr.</TableHeaderCell>
            <TableHeaderCell>Datum</TableHeaderCell>
            {onOpenKunde && <TableHeaderCell>Kunde</TableHeaderCell>}
            <TableHeaderCell>Positionen</TableHeaderCell>
            <TableHeaderCell className={mergeClasses(shared.num, shared.numHead)}>Netto</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell aria-label="Aktionen" style={{ width: '48px' }} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rechnungen.length === 0 && (
            <TableRow>
              <TableCell colSpan={cols} className={shared.muted}>
                {emptyText}
              </TableCell>
            </TableRow>
          )}
          {rechnungen.map((r) => {
            const kunde = data && r.kundeId !== null ? data.kundeById[r.kundeId] : undefined;
            const n = data && data.zeilenJeRechnung[r.id] ? data.zeilenJeRechnung[r.id].length : 0;
            return (
              <TableRow key={r.id} className={shared.clickableRow} onClick={rowClick(() => onShow(r))}>
                <TableCell className={shared.strong}>
                  <Link as="button" onClick={() => onShow(r)}>
                    {r.nummer}
                  </Link>
                </TableCell>
                <TableCell className={shared.num} style={{ textAlign: 'left' }}>
                  {formatDate(r.rechnungsdatum)}
                </TableCell>
                {onOpenKunde && (
                  <TableCell>
                    {kunde ? (
                      <Link as="button" onClick={() => onOpenKunde(kunde.id)}>
                        {kunde.name}
                      </Link>
                    ) : (
                      '–'
                    )}
                  </TableCell>
                )}
                <TableCell>{anzahlText(n, 'Position', 'Positionen')}</TableCell>
                <TableCell className={shared.num}>{formatEuro(r.summeNettoCent)}</TableCell>
                <TableCell>
                  <StatusBadge color={RECHNUNG_STATUS[r.status]} text={r.status} />
                </TableCell>
                <TableCell>
                  <InvoiceActions rechnung={r} onEditDraft={onEditDraft} onShow={onShow} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
