import * as React from 'react';
import { Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow, makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { formatDate } from '../../billing/dates';
import { formatEuro, formatMonate, totals } from '../../billing/money';
import { isActiveLine } from '../../billing/proposal';
import { IRechnung } from '../../data/mapping';
import { useApp } from '../AppContext';
import { useData } from '../DataContext';
import { RECHNUNG_STATUS } from '../derive';
import { InvoiceActions } from '../components/InvoiceActions';
import { StatusBadge } from '../components/StatusBadge';
import { barTooltip, ITimelineRow, Timeline } from '../components/Timeline';
import { useShared } from '../styles';

const useStyles = makeStyles({
  title: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  meta: { display: 'flex', flexWrap: 'wrap', gap: '8px 24px', margin: 0 },
  metaItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  dt: { color: tokens.colorNeutralForeground3, fontSize: '13px' },
  dd: { margin: 0, fontWeight: tokens.fontWeightSemibold, fontVariantNumeric: 'tabular-nums' },
  totals: { padding: '16px 20px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', justifyContent: 'flex-end' },
  dl: { margin: 0, display: 'grid', gridTemplateColumns: 'auto auto', columnGap: '32px', rowGap: '6px', fontVariantNumeric: 'tabular-nums', minWidth: '260px' },
  right: { margin: 0, textAlign: 'right' },
  total: { fontWeight: tokens.fontWeightBold, paddingTop: '6px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` }
});

export interface IInvoiceViewProps {
  rechnungId: number;
  onEditDraft: (rechnung: IRechnung) => void;
  onBack: () => void;
}

/** Rechnung anzeigen: Kopf mit Aktionen, Positionen, Zeitleiste. */
export function InvoiceView({ rechnungId, onEditDraft, onBack }: IInvoiceViewProps): React.ReactElement {
  const s = useStyles();
  const shared = useShared();
  const { settings } = useApp();
  const { data } = useData();
  if (!data) return <></>;
  const r = data.rechnungen.filter((x) => x.id === rechnungId)[0];
  if (!r) return <p>Rechnung nicht gefunden.</p>;
  const kunde = data.kunden.filter((k) => k.id === r.kundeId)[0];
  const vorgaenger = r.vorgaengerId ? data.rechnungen.filter((x) => x.id === r.vorgaengerId)[0] : undefined;
  const lines = data.rechnungspositionen.filter((l) => l.rechnungId === r.id);
  const t = totals(lines.map((l) => l.betragCent), settings.ustSatz);
  const datum = r.rechnungsdatum || '';

  // Zeitleiste: je Position dieser Rechnung alle verrechneten Zeiträume, diese Rechnung hervorgehoben
  const positionIds = lines.map((l) => l.positionId).filter((id, i, a): id is number => id !== null && a.indexOf(id) === i);
  const rows: ITimelineRow[] = positionIds.map((pid) => {
    const pos = data.positionen.filter((p) => p.id === pid)[0];
    const bars = data.billedLines
      .filter((b) => b.positionId === pid && b.von && b.bis && (isActiveLine(b) || b.rechnungId === r.id))
      .map((b) => ({
        key: `${b.rechnungId}-${b.von}`,
        von: b.von as string,
        bis: b.bis as string,
        kind: b.rechnungId === r.id ? ('current' as const) : ('other' as const),
        tooltip: barTooltip(`${b.rechnungsnummer || ''}${b.status === 'Entwurf' ? ' (Entwurf)' : ''}`, b.von as string, b.bis as string, formatEuro(b.betragCent || 0))
      }));
    return { key: String(pid), title: pos ? pos.title : lines.filter((l) => l.positionId === pid)[0].title, ende: pos ? pos.ende : null, bars };
  });

  return (
    <>
      <header className={mergeClasses(shared.card, shared.cardPadded)}>
        <div className={shared.spaceBetween}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div className={s.title}>
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
          <Table className={shared.table} aria-label="Positionen der Rechnung">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Position</TableHeaderCell>
                <TableHeaderCell>Von</TableHeaderCell>
                <TableHeaderCell>Bis</TableHeaderCell>
                <TableHeaderCell className={mergeClasses(shared.num, shared.numHead)}>Monate</TableHeaderCell>
                <TableHeaderCell className={mergeClasses(shared.num, shared.numHead)}>Menge</TableHeaderCell>
                <TableHeaderCell className={mergeClasses(shared.num, shared.numHead)}>Jahrespreis</TableHeaderCell>
                <TableHeaderCell className={mergeClasses(shared.num, shared.numHead)}>Betrag</TableHeaderCell>
                <TableHeaderCell>Art</TableHeaderCell>
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
                  <TableCell className={shared.num}>{String(l.menge).replace('.', ',')}</TableCell>
                  <TableCell className={shared.num}>{l.positionId !== null ? formatEuro(l.einzelpreisCent) : '–'}</TableCell>
                  <TableCell className={mergeClasses(shared.num, shared.strong)}>{formatEuro(l.betragCent)}</TableCell>
                  <TableCell className={shared.muted}>{l.art}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className={s.totals}>
          <dl className={s.dl}>
            <dt className={shared.muted}>Summe netto</dt>
            <dd className={s.right}>{formatEuro(t.nettoCent)}</dd>
            <dt className={shared.muted}>USt. {String(settings.ustSatz).replace('.', ',')} %</dt>
            <dd className={s.right}>{formatEuro(t.ustCent)}</dd>
            <dt className={s.total}>Gesamt brutto</dt>
            <dd className={mergeClasses(s.right, s.total)}>{formatEuro(t.bruttoCent)}</dd>
          </dl>
        </div>
      </section>

      {rows.length > 0 && datum && (
        <Timeline rows={rows} markerDate={datum} markerLabel="Rechnungsdatum" labels={{ current: 'diese Rechnung', other: 'andere Rechnungen' }} />
      )}
    </>
  );
}
