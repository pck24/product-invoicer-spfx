import { makeStyles, shorthands, tokens } from '@fluentui/react-components';

/** Gemeinsame Styles entsprechend den UX-Mockups. */
export const useShared = makeStyles({
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border('1px', 'solid', tokens.colorNeutralStroke2),
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    minWidth: 0
  },
  cardPadded: {
    padding: '20px 24px',
    gap: '16px'
  },
  cardHeader: {
    padding: '16px 20px',
    ...shorthands.borderBottom('1px', 'solid', tokens.colorNeutralStroke2),
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px'
  },
  h1: { margin: 0, fontSize: '22px', lineHeight: '28px', fontWeight: tokens.fontWeightSemibold },
  /** Titelzeile im Kopf (Titel + Chip/Badge) */
  titleRow: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  /** Textspalte im Kopf (Titelzeile + Unterzeile) */
  headerText: { display: 'flex', flexDirection: 'column', gap: '6px' },
  h2: { margin: 0, fontSize: '16px', lineHeight: '22px', fontWeight: tokens.fontWeightSemibold },
  muted: { color: tokens.colorNeutralForeground3 },
  row: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' },
  spaceBetween: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' },
  tableWrap: { overflowX: 'auto' },
  // Tabellen passen sich der Breite an; nur auf schmalen Geräten (< 640 px) scrollen sie in der Karte
  table: { width: '100%', tableLayout: 'auto', '@media (max-width: 640px)': { minWidth: '640px' } },
  num: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
  numHead: { '& .fui-TableHeaderCell__button': { justifyContent: 'flex-end' } },
  strong: { fontWeight: tokens.fontWeightSemibold },
  ended: { color: tokens.colorNeutralForeground4 },
  strike: { textDecorationLine: 'line-through' },
  due: { color: tokens.colorPaletteMarigoldForeground3, fontWeight: tokens.fontWeightSemibold },
  ok: { color: tokens.colorPaletteGreenForeground1 },
  chip: {
    padding: '2px 8px',
    borderRadius: '4px',
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground2,
    fontSize: '13px',
    fontVariantNumeric: 'tabular-nums'
  },
  clickableRow: { cursor: 'pointer' },
  // Felder oben ausrichten, sonst schiebt ein Hinweis/Fehlertext die Nachbarfelder nach unten
  formRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '12px', '& > *': { flexGrow: 1, flexBasis: '140px', minWidth: 0 } },
  // Labels halbfett wie im Mockup
  form: { display: 'flex', flexDirection: 'column', gap: '16px', '& label': { fontWeight: tokens.fontWeightSemibold } }
});
