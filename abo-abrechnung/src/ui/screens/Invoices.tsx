import * as React from 'react';
import {
  Dropdown,
  Link,
  Option,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  mergeClasses
} from '@fluentui/react-components';
import { formatDate } from '../../billing/dates';
import { formatEuro } from '../../billing/money';
import { IRechnung, neuesteZuerst } from '../../data/mapping';
import { useData } from '../DataContext';
import { InvoiceActions } from '../components/InvoiceActions';
import { StatusBadge } from '../components/StatusBadge';
import { RECHNUNG_STATUS } from '../derive';
import { useShared } from '../styles';

export interface IInvoicesProps {
  onOpenKunde: (kundeId: number) => void;
  onEditDraft: (rechnung: IRechnung) => void;
  onShow: (rechnung: IRechnung) => void;
}

/** Tab "Rechnungen": alle Rechnungen mit Jahresfilter und Aktionen. */
export function Invoices({ onOpenKunde, onEditDraft, onShow }: IInvoicesProps): React.ReactElement {
  const shared = useShared();
  const { data } = useData();
  const [jahr, setJahr] = React.useState('alle');
  if (!data) return <></>;

  const kundeName = (id: number | null): string => {
    const k = data.kunden.filter((x) => x.id === id)[0];
    return k ? k.name : '–';
  };
  const jahre = data.rechnungen
    .map((r) => (r.rechnungsdatum || '').substring(0, 4))
    .filter((y, i, a) => !!y && a.indexOf(y) === i)
    .sort()
    .reverse();
  const rows = data.rechnungen
    .filter((r) => jahr === 'alle' || (r.rechnungsdatum || '').substring(0, 4) === jahr)
    .sort(neuesteZuerst);

  return (
    <section className={shared.card} aria-labelledby="rechnungen-title">
      <div className={shared.cardHeader}>
        <h2 id="rechnungen-title" className={shared.h2}>
          Rechnungen
        </h2>
        <Dropdown
          aria-label="Jahr"
          value={jahr === 'alle' ? 'Alle Jahre' : jahr}
          selectedOptions={[jahr]}
          onOptionSelect={(_, d) => setJahr(d.optionValue || 'alle')}
          style={{ minWidth: '140px' }}
        >
          <Option value="alle">Alle Jahre</Option>
          {jahre.map((y) => (
            <Option key={y} value={y}>
              {y}
            </Option>
          ))}
        </Dropdown>
      </div>
      <div className={shared.tableWrap}>
        <Table className={shared.table} aria-label="Rechnungen">
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Nr.</TableHeaderCell>
              <TableHeaderCell>Datum</TableHeaderCell>
              <TableHeaderCell>Kunde</TableHeaderCell>
              <TableHeaderCell>Positionen</TableHeaderCell>
              <TableHeaderCell className={mergeClasses(shared.num, shared.numHead)}>Netto</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell aria-label="Aktionen" style={{ width: '48px' }} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className={shared.muted}>
                  Keine Rechnungen.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const n = data.rechnungspositionen.filter((l) => l.rechnungId === r.id).length;
              return (
                <TableRow key={r.id} className={shared.clickableRow} onClick={() => onShow(r)}>
                  <TableCell className={shared.strong}>
                    <Link
                      as="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onShow(r);
                      }}
                    >
                      {r.nummer}
                    </Link>
                  </TableCell>
                  <TableCell className={shared.num} style={{ textAlign: 'left' }}>
                    {formatDate(r.rechnungsdatum)}
                  </TableCell>
                  <TableCell>
                    {r.kundeId ? (
                      <Link
                        as="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenKunde(r.kundeId as number);
                        }}
                      >
                        {kundeName(r.kundeId)}
                      </Link>
                    ) : (
                      '–'
                    )}
                  </TableCell>
                  <TableCell>
                    {n} {n === 1 ? 'Position' : 'Positionen'}
                  </TableCell>
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
    </section>
  );
}
