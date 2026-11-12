import * as React from 'react';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { formatDate } from '../../billing/dates';
import { formatEuro, formatMonate, formatZahl, totals } from '../../billing/money';
import { IRechnung, IRechnungsposition } from '../../data/mapping';
import { timelineRows } from '../../export/timelineModel';
import { useApp } from '../AppContext';
import { useData } from '../DataContext';
import { RECHNUNG_STATUS } from '../derive';
import { InvoiceActions } from '../components/InvoiceActions';
import { StatusBadge } from '../components/StatusBadge';
import { ITimelineRow, Timeline } from '../components/Timeline';
import { TotalsBlock } from '../components/TotalsBlock';
import { useShared } from '../styles';
import { buildExportInput } from '../useExport';
import { useSort } from '../useSort';

const KEINE_ZEILEN: IRechnungsposition[] = [];

const useStyles = makeStyles({
  meta: { display: 'flex', flexWrap: 'wrap', gap: '8px 24px', margin: 0 },
  metaItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  dt: { color: tokens.colorNeutralForeground3, fontSize: '13px' },
  dd: { margin: 0, fontWeight: tokens.fontWeightSemibold, fontVariantNumeric: 'tabular-nums' }
});

export interface IInvoiceViewProps {
  rechnungId: number;
  onEditDraft: (rechnung: IRechnung) => void;
  onBack: () => void;
}

/** Rechnung anzeigen: Kopf mit Aktionen, Positionen, Zeitleiste. Gleiche Daten wie der Export. */
export function InvoiceView({ rechnungId, onEditDraft, onBack }: IInvoiceViewProps): React.ReactElement {
  const s = useStyles();
  const shared = useShared();
  const { settings } = useApp();
  const { data } = useData();
  const input = data ? buildExportInput(data, rechnungId, settings.ustSatz) : undefined;
  // Sortierung der Tabelle gilt auch für die Zeitleiste
  const { sorted: lines, header } = useSort(input ? input.lines : KEINE_ZEILEN, {
    position: (l) => l.title,
    von: (l) => l.von,
    bis: (l) => l.bis,
    monate: (l) => (l.positionId !== null ? l.monateX100 : null),
    menge: (l) => l.menge,
    preis: (l) => (l.positionId !== null ? l.einzelpreisCent : null),
    betrag: (l) => l.betragCent,
    art: (l) => l.art
  });
  if (!input) return <p>Rechnung nicht gefunden.</p>;
  const { rechnung: r, kunde, vorgaenger, ustSatz } = input;
  const t = totals(lines.map((l) => l.betragCent), ustSatz);

  // Zeitleiste: je Position dieser Rechnung alle verrechneten Zeiträume, diese Rechnung hervorgehoben
  const rows: ITimelineRow[] = timelineRows(r, lines, input.positionen, input.billedLines).map((row) => ({
    ...row,
    bars: row.bars.map((b) => ({
      key: b.key,
      von: b.von,
      bis: b.bis,
      kind: b.current ? ('current' as const) : ('other' as const),
      tooltip: `${b.rechnungsnummer}${b.entwurf ? ' (Entwurf)' : ''} · ${formatDate(b.von)} – ${formatDate(b.bis)} · ${formatEuro(b.betragCent)}`
    }))
  }));

  return (
    <>
      <header className={mergeClasses(shared.card, shared.cardPadded)}>
        <div className={shared.spaceBetween}>
          <div className={shared.headerText}>
            <div className={shared.titleRow}>
              <h1 className={shared.h1}>Rechnung {r.nummer}</h1>
              <StatusBadge color={RECHNUNG_STATUS[r.status]} text={r.status} />
            </div>
            <p className={shared.muted} style={{ margin: 0 }}>
              {kunde ? `${kunde.name} (${kunde.kundennummer})` : ''}
              {kunde && kunde.adresse && ` · ${kunde.adresse.replace(/\s*\n\s*/g, ', ')}`}
            </p>
          </div>
          <InvoiceActions rechnung={r} onEditDraft={onEditDraft} onDeleted={onBack} label="Aktionen" />
        </div>
        <dl className={s.meta}>
          <div className={s.metaItem}>
            <dt className={s.dt}>Rechnungsdatum</dt>
            <dd className={s.dd}>{formatDate(r.rechnungsdatum)}</dd>
          </div>
          <div className={s.metaItem}>
            <dt className={s.dt}>Vorgänger</dt>
            <dd className={s.dd}>{vorgaenger ? `${vorgaenger.nummer} vom ${formatDate(vorgaenger.rechnungsdatum)}` : '–'}</dd>
          </div>
          <div className={s.metaItem}>
            <dt className={s.dt}>Summe netto</dt>
            <dd className={s.dd}>{formatEuro(r.summeNettoCent)}</dd>
          </div>
        </dl>
      </header>

      <section className={shared.card} aria-labelledby="rp-title">
        <div className={shared.cardHeader}>
          <h2 id="rp-title" className={shared.h2}>
            Positionen
          </h2>
        </div>
        <div className={shared.tableWrap}>
          <Table className={shared.table} aria-label="Positionen der Rechnung" sortable>
            <TableHeader>
              <TableRow>
                <TableHeaderCell {...header('position')}>Position</TableHeaderCell>
                <TableHeaderCell {...header('von')}>Von</TableHeaderCell>
                <TableHeaderCell {...header('bis')}>Bis</TableHeaderCell>
                <TableHeaderCell {...header('monate')} className={mergeClasses(shared.num, shared.numHead)}>
                  Monate
                </TableHeaderCell>
                <TableHeaderCell {...header('menge')} className={mergeClasses(shared.num, shared.numHead)}>
                  Menge
                </TableHeaderCell>
                <TableHeaderCell {...header('preis')} className={mergeClasses(shared.num, shared.numHead)}>
                  Jahrespreis
                </TableHeaderCell>
                <TableHeaderCell {...header('betrag')} className={mergeClasses(shared.num, shared.numHead)}>
                  Betrag
                </TableHeaderCell>
                <TableHeaderCell {...header('art')}>Art</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className={shared.strong}>{l.title}</TableCell>
                  <TableCell className={shared.num} style={{ textAlign: 'left' }}>
                    {formatDate(l.von) || '–'}
                  </TableCell>
                  <TableCell className={shared.num} style={{ textAlign: 'left' }}>
                    {formatDate(l.bis) || '–'}
                  </TableCell>
                  <TableCell className={shared.num}>{l.positionId !== null ? formatMonate(l.monateX100) : '–'}</TableCell>
                  <TableCell className={shared.num}>{formatZahl(l.menge)}</TableCell>
                  <TableCell className={shared.num}>{l.positionId !== null ? formatEuro(l.einzelpreisCent) : '–'}</TableCell>
                  <TableCell className={mergeClasses(shared.num, shared.strong)}>{formatEuro(l.betragCent)}</TableCell>
                  <TableCell className={shared.muted}>{l.art}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <TotalsBlock totals={t} ustSatz={ustSatz} />
      </section>

      {rows.length > 0 && r.rechnungsdatum && (
        <Timeline rows={rows} markerDate={r.rechnungsdatum} markerLabel="Rechnungsdatum" labels={{ current: 'diese Rechnung', other: 'andere Rechnungen' }} />
      )}
    </>
  );
}
