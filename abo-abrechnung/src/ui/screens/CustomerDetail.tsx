import * as React from 'react';
import {
  Button,
  Link,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  makeStyles,
  mergeClasses
} from '@fluentui/react-components';
import { MoreHorizontal20Regular } from '@fluentui/react-icons';
import { formatDate, todayIso } from '../../billing/dates';
import { formatEuro } from '../../billing/money';
import { IPositionItem, IRechnung } from '../../data/mapping';
import { useApp } from '../AppContext';
import { errorText, useData } from '../DataContext';
import { isGekuendigt, laufzeitText, preisText, RECHNUNG_STATUS } from '../derive';
import { ConfirmDialog, IConfirmRequest } from '../components/ConfirmDialog';
import { InvoiceActions } from '../components/InvoiceActions';
import { KuendigenDialog } from '../components/KuendigenDialog';
import { KundeDrawer } from '../components/KundeDrawer';
import { PositionDrawer } from '../components/PositionDrawer';
import { StatusBadge } from '../components/StatusBadge';
import { Timeline } from '../components/Timeline';
import { useShared } from '../styles';
import { useSummaries } from './CustomerList';

const useStyles = makeStyles({
  title: { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' },
  badge: { marginLeft: '6px' }
});

export interface ICustomerDetailProps {
  kundeId: number;
  onFolgerechnung: () => void;
  onEditDraft: (rechnung: IRechnung) => void;
}

export function CustomerDetail({ kundeId, onFolgerechnung, onEditDraft }: ICustomerDetailProps): React.ReactElement {
  const s = useStyles();
  const shared = useShared();
  const { repo } = useApp();
  const { data, reload, notify } = useData();
  const summary = useSummaries().filter((x) => x.kunde.id === kundeId)[0];
  const [showEnded, setShowEnded] = React.useState(true);
  const [kundeDrawer, setKundeDrawer] = React.useState(false);
  const [positionDrawer, setPositionDrawer] = React.useState<{ open: boolean; position?: IPositionItem }>({ open: false });
  const [kuendigen, setKuendigen] = React.useState<IPositionItem | undefined>();
  const [confirm, setConfirm] = React.useState<IConfirmRequest | undefined>();

  if (!summary || !data) return <p>Kunde nicht gefunden.</p>;
  const { kunde } = summary;
  const today = todayIso();
  const ids = summary.positionen.map((p) => p.id);
  const lines = data.billedLines.filter((l) => l.positionId !== null && ids.indexOf(l.positionId) >= 0);
  const proposals = summary.proposals.filter((p) => showEnded || !isGekuendigt(p.position, today));
  const rechnungen = data.rechnungen
    .filter((r) => r.kundeId === kundeId)
    .sort((a, b) => (b.rechnungsdatum || '').localeCompare(a.rechnungsdatum || '') || b.id - a.id);

  const hasAnyLine = (positionId: number): boolean => data.rechnungspositionen.some((l) => l.positionId === positionId);

  const loeschen = (p: IPositionItem): void =>
    setConfirm({
      title: 'Position löschen',
      message: `Die Position „${p.title}“ wurde nie verrechnet und wird endgültig gelöscht.`,
      confirmText: 'Löschen',
      onConfirm: async () => {
        try {
          await repo.deletePosition(p.id);
          await reload();
          notify('Position gelöscht');
        } catch (e) {
          notify(errorText(e), 'error');
        }
      }
    });

  const kuendigungAufheben = async (p: IPositionItem): Promise<void> => {
    try {
      const { id, ...rest } = p;
      await repo.savePosition({ ...rest, ende: null }, id);
      await reload();
      notify(`Kündigung von ${p.title} aufgehoben`);
    } catch (e) {
      notify(errorText(e), 'error');
    }
  };

  return (
    <>
      <header className={mergeClasses(shared.card, shared.cardPadded)}>
        <div className={shared.spaceBetween}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div className={s.title}>
              <h1 className={shared.h1}>{kunde.name}</h1>
              <span className={shared.chip}>{kunde.kundennummer}</span>
              {!kunde.aktiv && <StatusBadge color="informative" text="inaktiv" />}
            </div>
            {kunde.adresse && (
              <p className={shared.muted} style={{ margin: 0 }}>
                {kunde.adresse.replace(/\s*\n\s*/g, ', ')}
              </p>
            )}
          </div>
          <div className={shared.row}>
            <Button onClick={() => setKundeDrawer(true)}>Bearbeiten</Button>
            <Button onClick={() => setPositionDrawer({ open: true })}>+ Position</Button>
            <Button appearance="primary" disabled={!summary.rechnungMoeglich} onClick={onFolgerechnung}>
              {rechnungen.some((r) => r.status !== 'Storniert') ? 'Folgerechnung erstellen' : 'Erste Rechnung erstellen'}
            </Button>
          </div>
        </div>
      </header>

      <section className={shared.card} aria-labelledby="pos-title">
        <div className={shared.cardHeader}>
          <h2 id="pos-title" className={shared.h2}>
            Positionen
          </h2>
          <Switch label="Gekündigte anzeigen" checked={showEnded} onChange={(_, d) => setShowEnded(d.checked)} />
        </div>
        <div className={shared.tableWrap}>
          <Table className={shared.table} aria-label="Positionen">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Produkt</TableHeaderCell>
                <TableHeaderCell className={mergeClasses(shared.num, shared.numHead)}>Menge</TableHeaderCell>
                <TableHeaderCell className={mergeClasses(shared.num, shared.numHead)}>Jahrespreis</TableHeaderCell>
                <TableHeaderCell>Laufzeit</TableHeaderCell>
                <TableHeaderCell>Verrechnet bis</TableHeaderCell>
                <TableHeaderCell aria-label="Aktionen" style={{ width: '48px' }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {proposals.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className={shared.muted}>
                    Noch keine Positionen. Mit „+ Position“ anlegen.
                  </TableCell>
                </TableRow>
              )}
              {proposals.map((p) => {
                const pos = summary.positionen.filter((x) => x.id === p.position.id)[0];
                const ended = isGekuendigt(pos, today);
                return (
                  <TableRow key={pos.id} className={ended ? shared.ended : undefined}>
                    <TableCell className={shared.strong}>
                      <span className={ended ? shared.strike : undefined}>{pos.title}</span>
                      {p.verrechnetBis === null && !ended && (
                        <span className={s.badge}>
                          <StatusBadge color="brand" text="neu" size="small" />
                        </span>
                      )}
                      {pos.ende && (
                        <span className={s.badge}>
                          <StatusBadge color="informative" text={`gekündigt zum ${formatDate(pos.ende)}`} size="small" />
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={shared.num}>{String(pos.menge).replace('.', ',')}</TableCell>
                    <TableCell className={shared.num}>{preisText(pos)}</TableCell>
                    <TableCell>{laufzeitText(pos.laufzeitMonate)}</TableCell>
                    <TableCell className={shared.num} style={{ textAlign: 'left' }}>
                      {p.verrechnetBis ? formatDate(p.verrechnetBis) : <span className={shared.muted}>noch nie</span>}
                    </TableCell>
                    <TableCell>
                      <Menu>
                        <MenuTrigger disableButtonEnhancement>
                          <Button appearance="subtle" icon={<MoreHorizontal20Regular />} aria-label={`Aktionen für ${pos.title}`} />
                        </MenuTrigger>
                        <MenuPopover>
                          <MenuList>
                            <MenuItem onClick={() => setPositionDrawer({ open: true, position: pos })}>Bearbeiten</MenuItem>
                            <MenuItem onClick={() => setKuendigen(pos)}>{pos.ende ? 'Kündigungsdatum ändern' : 'Kündigen'}</MenuItem>
                            {pos.ende && <MenuItem onClick={() => kuendigungAufheben(pos)}>Kündigung aufheben</MenuItem>}
                            {!hasAnyLine(pos.id) && <MenuItem onClick={() => loeschen(pos)}>Löschen</MenuItem>}
                          </MenuList>
                        </MenuPopover>
                      </Menu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className={shared.card} aria-labelledby="hist-title">
        <div className={shared.cardHeader}>
          <h2 id="hist-title" className={shared.h2}>
            Rechnungshistorie
          </h2>
        </div>
        <div className={shared.tableWrap}>
          <Table className={shared.table} aria-label="Rechnungshistorie">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Nr.</TableHeaderCell>
                <TableHeaderCell>Datum</TableHeaderCell>
                <TableHeaderCell>Positionen</TableHeaderCell>
                <TableHeaderCell className={mergeClasses(shared.num, shared.numHead)}>Netto</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell aria-label="Dokument" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rechnungen.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className={shared.muted}>
                    Noch keine Rechnungen.
                  </TableCell>
                </TableRow>
              )}
              {rechnungen.map((r) => {
                const n = data.rechnungspositionen.filter((l) => l.rechnungId === r.id).length;
                return (
                  <TableRow key={r.id}>
                    <TableCell className={shared.strong}>{r.nummer}</TableCell>
                    <TableCell>{formatDate(r.rechnungsdatum)}</TableCell>
                    <TableCell>
                      {n} {n === 1 ? 'Zeitraum' : 'Zeiträume'}
                    </TableCell>
                    <TableCell className={shared.num}>{formatEuro(r.summeNettoCent)}</TableCell>
                    <TableCell>
                      <StatusBadge color={RECHNUNG_STATUS[r.status]} text={r.status} />
                    </TableCell>
                    <TableCell style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.pdfUrl && (
                        <Link href={r.pdfUrl} target="_blank" rel="noreferrer">
                          PDF öffnen
                        </Link>
                      )}
                      <InvoiceActions rechnung={r} onEditDraft={onEditDraft} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Zeitstrahl nur, wenn es verrechnete Zeiträume gibt */}
      {lines.some((l) => l.status === 'Entwurf' || l.status === 'Erstellt') && <Timeline proposals={proposals} lines={lines} today={today} />}

      <KundeDrawer open={kundeDrawer} kunde={kunde} onClose={() => setKundeDrawer(false)} />
      <PositionDrawer open={positionDrawer.open} kunde={kunde} position={positionDrawer.position} onClose={() => setPositionDrawer({ open: false })} />
      <KuendigenDialog position={kuendigen} onClose={() => setKuendigen(undefined)} />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(undefined)} />
    </>
  );
}
