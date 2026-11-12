import * as React from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { formatEuro, formatZahl, ITotals } from '../../billing/money';
import { useShared } from '../styles';

const useStyles = makeStyles({
  root: { padding: '16px 20px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, display: 'flex', justifyContent: 'flex-end' },
  dl: { margin: 0, display: 'grid', gridTemplateColumns: 'auto auto', columnGap: '32px', rowGap: '6px', fontVariantNumeric: 'tabular-nums', minWidth: '260px' },
  dd: { margin: 0, textAlign: 'right' },
  total: { fontWeight: tokens.fontWeightBold, paddingTop: '6px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` }
});

/** Summenblock Netto / USt / Brutto am Ende einer Positionstabelle. */
export function TotalsBlock({ totals, ustSatz }: { totals: ITotals; ustSatz: number }): React.ReactElement {
  const s = useStyles();
  const shared = useShared();
  return (
    <div className={s.root}>
      <dl className={s.dl}>
        <dt className={shared.muted}>Summe netto</dt>
        <dd className={s.dd}>{formatEuro(totals.nettoCent)}</dd>
        <dt className={shared.muted}>USt. {formatZahl(ustSatz)} %</dt>
        <dd className={s.dd}>{formatEuro(totals.ustCent)}</dd>
        <dt className={s.total}>Gesamt brutto</dt>
        <dd className={mergeClasses(s.dd, s.total)}>{formatEuro(totals.bruttoCent)}</dd>
      </dl>
    </div>
  );
}
