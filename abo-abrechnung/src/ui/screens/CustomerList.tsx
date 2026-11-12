import * as React from 'react';
import {
  Button,
  Link,
  SearchBox,
  Tab,
  TabList,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  ToggleButton,
  makeStyles,
  mergeClasses
} from '@fluentui/react-components';
import { formatDate } from '../../billing/dates';
import { formatEuro } from '../../billing/money';
import { useData } from '../DataContext';
import { kpis } from '../derive';
import { rowClick } from '../rowClick';
import { KpiCard } from '../components/KpiCard';
import { KundeDrawer } from '../components/KundeDrawer';
import { useShared } from '../styles';
import { useSort } from '../useSort';

const useStyles = makeStyles({
  search: { width: '260px', maxWidth: '100%' },
  kpis: { display: 'flex', flexWrap: 'wrap', gap: '16px' },
  pill: { borderRadius: '16px' }
});

export type HomeTab = 'kunden' | 'rechnungen';
type Filter = 'alle' | 'faellig' | 'aktuell';

export interface ICustomerListProps {
  tab: HomeTab;
  onTab: (tab: HomeTab) => void;
  onOpen: (kundeId: number) => void;
  rechnungen: React.ReactNode;
}

export function CustomerList({ tab, onTab, onOpen, rechnungen }: ICustomerListProps): React.ReactElement {
  const s = useStyles();
  const shared = useShared();
  const { summaries } = useData();
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState<Filter>('alle');
  const [drawer, setDrawer] = React.useState(false);

  const k = kpis(summaries);
  const q = search.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      summaries.filter(
        (x) =>
          (!q || x.kunde.name.toLowerCase().indexOf(q) >= 0 || x.kunde.kundennummer.toLowerCase().indexOf(q) >= 0) &&
          (filter === 'alle' || (filter === 'faellig') === x.offen)
      ),
    [summaries, q, filter]
  );
  const { sorted: rows, header } = useSort(filtered, {
    nummer: (x) => x.kunde.kundennummer,
    name: (x) => x.kunde.name,
    positionen: (x) => x.aktivePositionen,
    letzte: (x) => (x.letzteRechnung ? x.letzteRechnung.rechnungsdatum : null)
  });

  return (
    <>
      <header className={mergeClasses(shared.card, shared.cardPadded)}>
        <div className={shared.spaceBetween}>
          <div>
            <h1 className={shared.h1}>Abo-Abrechnung</h1>
            <p className={shared.muted} style={{ margin: 0 }}>
              Kunden, laufende Positionen und Folgerechnungen
            </p>
          </div>
          <div className={shared.row}>
            {tab === 'kunden' && (
              <SearchBox
                className={s.search}
                placeholder="Name oder Kundennummer"
                aria-label="Kunden suchen"
                value={search}
                onChange={(_, d) => setSearch(d.value)}
              />
            )}
            <Button appearance="primary" onClick={() => setDrawer(true)}>
              + Kunde anlegen
            </Button>
          </div>
        </div>
        <TabList selectedValue={tab} onTabSelect={(_, d) => onTab(d.value as HomeTab)} aria-label="Bereiche">
          <Tab value="kunden">Kunden</Tab>
          <Tab value="rechnungen">Rechnungen</Tab>
        </TabList>
      </header>

      {tab === 'rechnungen' ? (
        rechnungen
      ) : (
        <>
          <section aria-label="Überblick" className={s.kpis}>
            <KpiCard label="Nächster Abrechnungstermin" value={k.naechsterTermin ? formatDate(k.naechsterTermin) : '–'} />
            <KpiCard label="Kunden mit offenen Zeiträumen" value={`${k.offen} von ${k.gesamt}`} />
            <KpiCard label="Vorschlag gesamt (netto)" value={formatEuro(k.vorschlagNettoCent)} />
          </section>

          <section className={shared.card} aria-labelledby="kunden-title">
            <div className={shared.cardHeader}>
              <h2 id="kunden-title" className={shared.h2}>
                Kunden
              </h2>
              <div className={shared.row} role="group" aria-label="Filter">
                {(['alle', 'faellig', 'aktuell'] as Filter[]).map((f) => (
                  <ToggleButton
                    key={f}
                    className={s.pill}
                    shape="circular"
                    checked={filter === f}
                    appearance={filter === f ? 'outline' : 'secondary'}
                    onClick={() => setFilter(f)}
                  >
                    {f === 'alle' ? 'Alle' : f === 'faellig' ? 'Fällig' : 'Aktuell'}
                  </ToggleButton>
                ))}
              </div>
            </div>
            <div className={shared.tableWrap}>
              <Table className={shared.table} aria-label="Kunden" sortable>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell {...header('nummer')}>Kd.-Nr.</TableHeaderCell>
                    <TableHeaderCell {...header('name')}>Name</TableHeaderCell>
                    <TableHeaderCell {...header('positionen')}>Aktive Positionen</TableHeaderCell>
                    <TableHeaderCell {...header('letzte')}>Letzte Rechnung</TableHeaderCell>
                    <TableHeaderCell aria-label="Aktion" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className={shared.muted}>
                        {summaries.length === 0 ? 'Noch keine Kunden angelegt.' : 'Keine Kunden gefunden.'}
                      </TableCell>
                    </TableRow>
                  )}
                  {rows.map((x) => (
                    <TableRow key={x.kunde.id} className={shared.clickableRow} onClick={rowClick(() => onOpen(x.kunde.id))}>
                      <TableCell className={shared.num} style={{ textAlign: 'left' }}>
                        {x.kunde.kundennummer}
                      </TableCell>
                      <TableCell className={shared.strong}>{x.kunde.name}</TableCell>
                      <TableCell>
                        {x.aktivePositionen}
                        {x.gekuendigtePositionen > 0 && <span className={shared.muted}> ({x.gekuendigtePositionen} gekündigt)</span>}
                      </TableCell>
                      <TableCell>
                        {x.letzteRechnung ? `${x.letzteRechnung.nummer} · ${formatDate(x.letzteRechnung.rechnungsdatum)}` : <span className={shared.muted}>–</span>}
                      </TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <Link as="button" className={shared.strong} onClick={() => onOpen(x.kunde.id)}>
                          Öffnen
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}

      <KundeDrawer open={drawer} onClose={() => setDrawer(false)} onSaved={(kunde) => onOpen(kunde.id)} />
    </>
  );
}
