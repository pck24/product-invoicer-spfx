import * as React from 'react';
import { Tooltip, makeStyles, mergeClasses, shorthands, tokens } from '@fluentui/react-components';
import { addDaysIso, diffDays } from '../../billing/dates';
import { ISODate } from '../../billing/types';
import { timelineRange } from '../../export/timelineModel';
import { useShared } from '../styles';

const useStyles = makeStyles({
  legend: { display: 'flex', flexWrap: 'wrap', gap: '16px', color: tokens.colorNeutralForeground2, fontSize: '13px' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '6px' },
  swatch: { width: '18px', height: '10px', borderRadius: '2px', boxSizing: 'border-box' },
  body: { padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: '10px', '@media (max-width: 640px)': { minWidth: '600px' } },
  row: { display: 'flex', gap: '16px', alignItems: 'center' },
  // Bezeichnungen bekommen bis zu 45 % der Breite, die Balken rücken zusammen
  label: { flex: '0 0 45%', maxWidth: '600px', minWidth: '160px', fontWeight: tokens.fontWeightSemibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  years: { flex: 1, position: 'relative', height: '18px', color: tokens.colorNeutralForeground3, fontSize: '12px' },
  year: { position: 'absolute', top: 0, paddingLeft: '6px', ...shorthands.borderLeft('1px', 'solid', tokens.colorNeutralStroke2) },
  track: { flex: 1, position: 'relative', height: '22px', backgroundColor: tokens.colorNeutralBackground2, borderRadius: '3px' },
  seg: { position: 'absolute', top: '3px', bottom: '3px', borderRadius: '3px', boxSizing: 'border-box', minWidth: '2px' },
  current: { backgroundColor: tokens.colorBrandBackground },
  other: { backgroundColor: tokens.colorBrandBackground2, ...shorthands.border('1px', 'solid', tokens.colorBrandStroke2) },
  endedRow: { color: tokens.colorNeutralForeground4 },
  marker: { position: 'absolute', width: '2px' },
  date: { top: '-4px', bottom: '-4px', backgroundColor: tokens.colorPaletteRedBackground3 },
  cancel: { top: 0, bottom: 0, backgroundColor: tokens.colorNeutralForeground3 }
});

export type BarKind = 'current' | 'other';

export interface ITimelineBar {
  key: string;
  von: ISODate;
  bis: ISODate;
  kind: BarKind;
  tooltip: string;
}

export interface ITimelineRow {
  key: string;
  title: string;
  /** Kündigungsdatum */
  ende: ISODate | null;
  bars: ITimelineBar[];
}

export interface ITimelineProps {
  rows: ITimelineRow[];
  /** rote Markierung, z. B. Rechnungsdatum */
  markerDate: ISODate;
  markerLabel: string;
  /** Legendentexte je Balkenart (nur vorkommende Arten werden gezeigt) */
  labels: { [k in BarKind]?: string };
}

/** Jahresraster mit einer Spur je Zeile. */
export function Timeline({ rows, markerDate, markerLabel, labels }: ITimelineProps): React.ReactElement {
  const s = useStyles();
  const shared = useShared();

  const { startYear, endYear } = timelineRange(rows, markerDate);
  const rangeStart = `${startYear}-01-01`;
  const rangeEnd = `${endYear + 1}-01-01`;
  const total = diffDays(rangeStart, rangeEnd);
  const pct = (d: ISODate): number => Math.max(0, Math.min(100, (diffDays(rangeStart, d) / total) * 100));
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  const kinds = (['current', 'other'] as BarKind[]).filter((k) => labels[k] && rows.some((r) => r.bars.some((b) => b.kind === k)));
  const hasCancel = rows.some((r) => !!r.ende);

  return (
    <section className={shared.card} aria-labelledby="timeline-title">
      <div className={shared.cardHeader}>
        <h2 id="timeline-title" className={shared.h2}>
          Zeitleiste
        </h2>
        <div className={s.legend}>
          {kinds.map((k) => (
            <span key={k} className={s.legendItem}>
              <span aria-hidden="true" className={mergeClasses(s.swatch, s[k])} />
              {labels[k]}
            </span>
          ))}
          {hasCancel && (
            <span className={s.legendItem}>
              <span aria-hidden="true" className={s.cancel} style={{ width: '2px', height: '14px' }} />
              Kündigung
            </span>
          )}
          <span className={s.legendItem}>
            <span aria-hidden="true" className={s.date} style={{ width: '2px', height: '14px' }} />
            {markerLabel}
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
          {rows.map((r) => {
            const ended = !!r.ende && r.ende < markerDate;
            return (
              <div key={r.key} className={mergeClasses(s.row, ended && s.endedRow)}>
                <span className={s.label} title={r.title}>
                  {r.title}
                </span>
                <div className={s.track}>
                  {r.bars
                    .filter((b) => b.bis >= rangeStart && b.von < rangeEnd)
                    .map((b) => {
                      const left = pct(b.von);
                      const width = pct(addDaysIso(b.bis, 1)) - left;
                      return (
                        <Tooltip key={b.key} content={b.tooltip} relationship="label" withArrow>
                          <div
                            tabIndex={0}
                            role="img"
                            className={mergeClasses(s.seg, s[b.kind])}
                            style={{ left: `${left}%`, width: `calc(${width}% - 2px)` }}
                          />
                        </Tooltip>
                      );
                    })}
                  {r.ende && r.ende >= rangeStart && r.ende < rangeEnd && (
                    <div aria-hidden="true" className={mergeClasses(s.marker, s.cancel)} style={{ left: `${pct(addDaysIso(r.ende, 1))}%` }} />
                  )}
                  <div aria-hidden="true" className={mergeClasses(s.marker, s.date)} style={{ left: `${pct(markerDate)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
