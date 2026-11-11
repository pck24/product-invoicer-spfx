import * as React from 'react';
import { makeStyles, mergeClasses, tokens } from '@fluentui/react-components';
import { useShared } from '../styles';

const useStyles = makeStyles({
  root: { flex: '1 1 220px', padding: '16px 20px', gap: '4px' },
  label: { color: tokens.colorNeutralForeground3, fontSize: '13px' },
  value: { fontSize: '24px', lineHeight: '32px', fontWeight: tokens.fontWeightSemibold, fontVariantNumeric: 'tabular-nums' }
});

export function KpiCard({ label, value }: { label: string; value: string }): React.ReactElement {
  const s = useStyles();
  const shared = useShared();
  return (
    <div className={mergeClasses(shared.card, s.root)}>
      <span className={s.label}>{label}</span>
      <span className={s.value}>{value}</span>
    </div>
  );
}
