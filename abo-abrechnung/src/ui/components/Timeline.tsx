import * as React from 'react';
import { Tooltip, makeStyles, mergeClasses, shorthands, tokens } from '@fluentui/react-components';
import { addDaysIso, diffDays, formatDate, maxIso, minIso } from '../../billing/dates';
import { formatEuro } from '../../billing/money';
import { IPositionProposal, isActiveLine } from '../../billing/proposal';
import { IBilledLine, ISODate } from '../../billing/types';
import { useShared } from '../styles';

const useStyles = makeStyles({
  legend: { display: 'flex', flexWrap: 'wrap', gap: '16px', color: tokens.colorNeutralForeground2, fontSize: '13px' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '6px' },
  swatch: { width: '18px', height: '10px', borderRadius: '2px', boxSizing: 'border-box' },
  body: { minWidth: '880px', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: '10px' },
  row: { display: 'flex', gap: '16px', alignItems: 'center' },
  label: { width: '220px', flex: 'none', fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  years: { flex: 1, position: 'relative', height: '18px', color: tokens.colorNeutralForeground3, fontSize: '12px' },
  year: { position: 'absolute', top: 0, paddingLeft: '6px', ...shorthands.borderLeft('1px', 'solid', tokens.colorNeutralStroke2) },
  track: { flex: 1, position: 'relative', height: '22px', backgroundColor: tokens.colorNeutralBackground2, borderRadius: '3px' },
  seg: { position: 'absolute', top: '3px', bottom: '3px', borderRadius: '3px', boxSizing: 'border-box', minWidth: '2px' },
  billed: { backgroundColor: tokens.colorBrandBackground },
  proposal: {
    backgroundColor: tokens.colorPaletteYellowBackground2,
    ...shorthands.border('1px', 'dashed', tokens.colorPaletteMarigoldBorderActive)
  },
  endedRow: { color: tokens.colorNeutralForeground4, '& [data-billed]': { opacity: 0.45 } },
  marker: { position: 'absolute', width: '2px' },
  today: { top: '-4px', bottom: '-4px', backgroundColor: tokens.colorPaletteRedBackground3 },
  cancel: { top: 0, bottom: 0, backgroundColor: tokens.colorNeutralForeground3 }
});

export interface ITimelineProps {
  proposals: IPositionProposal[];
  lines: IBilledLine[];
  today: ISODate;
}

interface IBar {
  key: string;
  von: ISODate;
  bis: ISODate;
  kind: 'billed' | 'proposal';
  tooltip: string;
}

export function Timeline({ proposals, lines, today }: ITimelineProps): React.ReactElement {
  const s = useStyles();
  const shared = useShared();

  const rows = proposals.map((p) => {
    const bars: IBar[] = [];
    for (const l of lines) {
      if (l.positionId !== p.position.id || !l.von || !l.bis || !isActiveLine(l)) continue;
      bars.push({
        key: `b${l.rechnungId}-${l.von}`,
        von: l.von,
        bis: l.bis,
        kind: 'billed',
        tooltip: `${l.rechnungsnummer || ''}${l.status === 'Entwurf' ? ' (Entwurf)' : ''} · ${formatDate(l.von)} – ${formatDate(l.bis)} · ${formatEuro(l.betragCent || 0)}`
      });
    }
    for (const seg of p.segments) {
      bars.push({
        key: `p${seg.von}`,
        von: seg.von,
        bis: seg.bis,
        kind: 'proposal',
        tooltip: `Vorschlag · ${formatDate(seg.von)} – ${formatDate(seg.bis)} · ${formatEuro(seg.betragCent)}`
      });
    }
    return { p, bars };
  });

  // Zeitraum: bis zu 5 Jahre, endend mit dem spätesten Datum
  let min: ISODate = today;
  let max: ISODate = today;
  for (const r of rows) {
    min = minIso(min, r.p.position.beginn);
    for (const b of r.bars) {
      min = minIso(min, b.von);
      max = maxIso(max, b.bis);
    }
  }
  const endYear = Number(max.substring(0, 4));
  const startYear = Math.max(Number(min.substring(0, 4)), endYear - 4);
  const rangeStart = `${startYear}-01-01`;
  const rangeEnd = `${endYear + 1}-01-01`;
  const total = diffDays(rangeStart, rangeEnd);
  const pct = (d: ISODate): number => Math.max(0, Math.min(100, (diffDays(rangeStart, d) / total) * 100));
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);

  return (
    <section className={shared.card} aria-labelledby="timeline-title">
      <div className={shared.cardHeader}>
        <h2 id="timeline-title" className={shared.h2}>
          Zeitleiste der verrechneten Zeiträume
        </h2>
        <div className={s.legend}>
          <span className={s.legendItem}>
            <span aria-hidden="true" className={mergeClasses(s.swatch, s.billed)} />
            verrechnet
          </span>
          <span className={s.legendItem}>
            <span aria-hidden="true" className={mergeClasses(s.swatch, s.proposal)} />
            Vorschlag Folgerechnung
          </span>
          <span className={s.legendItem}>
            <span aria-hidden="true" className={s.cancel} style={{ width: '2px', height: '14px' }} />
            Kündigung
          </span>
          <span className={s.legendItem}>
            <span aria-hidden="true" className={s.today} style={{ width: '2px', height: '14px' }} />
            heute
          </span>
        </div>
      </div>
      <div className={shared.tableWrap}>
        <div className={s.body}>
          <div className={s.row}>
            <span className={s.label} />
            <div className={s.years}>
              {years.map((y) => (
                <span key={y} className={s.year} style={{ left: `${pct(`${y}-01-01`)}%` }}>
                  {y}
                </span>
              ))}
            </div>
          </div>
          {rows.map(({ p, bars }) => {
            const ended = !!p.position.ende && p.position.ende < today;
            return (
              <div key={p.position.id} className={mergeClasses(s.row, ended && s.endedRow)}>
                <span className={s.label} title={p.position.title}>
                  {p.position.title}
                  {ended ? ' (gekündigt)' : ''}
                </span>
                <div className={s.track}>
                  {bars
                    .filter((b) => b.bis >= rangeStart && b.von < rangeEnd)
                    .map((b) => {
                      const left = pct(b.von);
                      const width = pct(addDaysIso(b.bis, 1)) - left;
                      return (
                        <Tooltip key={b.key} content={b.tooltip} relationship="label" withArrow>
                          <div
                            tabIndex={0}
                            role="img"
                            data-billed={b.kind === 'billed' ? '' : undefined}
                            className={mergeClasses(s.seg, b.kind === 'billed' ? s.billed : s.proposal)}
                            style={{ left: `${left}%`, width: `calc(${width}% - 2px)` }}
                          />
                        </Tooltip>
                      );
                    })}
                  {p.position.ende && p.position.ende >= rangeStart && p.position.ende < rangeEnd && (
                    <div aria-hidden="true" className={mergeClasses(s.marker, s.cancel)} style={{ left: `${pct(addDaysIso(p.position.ende, 1))}%` }} />
                  )}
                  <div aria-hidden="true" className={mergeClasses(s.marker, s.today)} style={{ left: `${pct(today)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
