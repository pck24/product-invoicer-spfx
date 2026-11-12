import * as React from 'react';
import {
  Button,
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
import { formatZahl } from '../../billing/money';
import { IPositionItem, IRechnung, neuesteZuerst } from '../../data/mapping';
import { useApp } from '../AppContext';
import { errorText, useData } from '../DataContext';
import { isGekuendigt, laufzeitText, preisText } from '../derive';
import { ConfirmDialog, IConfirmRequest } from '../components/ConfirmDialog';
import { KuendigenDialog } from '../components/KuendigenDialog';
import { KundeDrawer } from '../components/KundeDrawer';
import { PositionDrawer } from '../components/PositionDrawer';
import { RechnungenTable } from '../components/RechnungenTable';
import { StatusBadge } from '../components/StatusBadge';
import { useShared } from '../styles';
import { useSort } from '../useSort';

const useStyles = makeStyles({
  badge: { marginLeft: '6px' }
});

export interface ICustomerDetailProps {
  kundeId: number;
  onFolgerechnung: () => void;
  onEditDraft: (rechnung: IRechnung) => void;
  onShow: (rechnung: IRechnung) => void;
}

export function CustomerDetail({ kundeId, onFolgerechnung, onEditDraft, onShow }: ICustomerDetailProps): React.ReactElement {
  const s = useStyles();
  const shared = useShared();
  const { repo } = useApp();
  const { data, summaries, reload, notify } = useData();
  const summary = summaries.filter((x) => x.kunde.id === kundeId)[0];
  const [showEnded, setShowEnded] = React.useState(true);
  const [kundeDrawer, setKundeDrawer] = React.useState(false);
  const [positionDrawer, setPositionDrawer] = React.useState<{ open: boolean; position?: IPositionItem }>({ open: false });
  const [kuendigen, setKuendigen] = React.useState<IPositionItem | undefined>();
  const [confirm, setConfirm] = React.useState<IConfirmRequest | undefined>();
  const today = todayIso();
  const visible = React.useMemo(
    () => (summary ? summary.proposals.filter((p) => showEnded || !isGekuendigt(p.position, today)) : []),
    [summary, showEnded, today]
  );
  const { sorted: proposals, header } = useSort(visible, {
    produkt: (p) => p.position.title,
    menge: (p) => p.position.menge,
    preis: (p) => p.position.jahrespreisCent,
    laufzeit: (p) => p.position.laufzeitMonate,
    verrechnet: (p) => p.verrechnetBis
  });

  if (!summary || !data) return <p>Kunde nicht gefunden.</p>;
  const { kunde } = summary;
  const rechnungen = data.rechnungen.filter((r) => r.kundeId === kundeId).sort(neuesteZuerst);

  /** Speichert eine Aktion, lädt neu und meldet das Ergebnis. */
  const run = async (action: () => Promise<unknown>, ok: string): Promise<void> => {
    try {
      await action();
      await reload();
      notify(ok);
    } catch (e) {
      notify(errorText(e), 'error');
    }
  };

  const loeschen = (p: IPositionItem): void =>
    setConfirm({
      title: 'Position löschen',
      message: `Die Position „${p.title}“ wurde nie verrechnet und wird endgültig gelöscht.`,
      confirmText: 'Löschen',
      onConfirm: () => run(() => repo.deletePosition(p.id), 'Position gelöscht')
    });

  const kuendigungAufheben = ({ id, ...rest }: IPositionItem): Promise<void> =>
    run(() => repo.savePosition({ ...rest, ende: null }, id), `Kündigung von ${rest.title} aufgehoben`);

  return (
    <>
      <header className={mergeClasses(shared.card, shared.cardPadded)}>
        <div className={shared.spaceBetween}>
          <div className={shared.headerText}>
            <div className={shared.titleRow}>
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
              {summary.letzteRechnung ? 'Folgerechnung erstellen' : 'Erste Rechnung erstellen'}
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
          <Table className={shared.table} aria-label="Positionen" sortable>
            <TableHeader>
              <TableRow>
                <TableHeaderCell {...header('produkt')}>Produkt</TableHeaderCell>
                <TableHeaderCell {...header('menge')} className={mergeClasses(shared.num, shared.numHead)}>
                  Menge
                </TableHeaderCell>
                <TableHeaderCell {...header('preis')} className={mergeClasses(shared.num, shared.numHead)}>
                  Jahrespreis
                </TableHeaderCell>
                <TableHeaderCell {...header('laufzeit')}>Laufzeit</TableHeaderCell>
                <TableHeaderCell {...header('verrechnet')}>Verrechnet bis</TableHeaderCell>
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
              {proposals.map(({ position: pos, verrechnetBis }) => {
                const ended = isGekuendigt(pos, today);
                return (
                  <TableRow key={pos.id} className={ended ? shared.ended : undefined}>
                    <TableCell className={shared.strong}>
                      <span className={ended ? shared.strike : undefined}>{pos.title}</span>
                      {verrechnetBis === null && !ended && (
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
                    <TableCell className={shared.num}>{formatZahl(pos.menge)}</TableCell>
                    <TableCell className={shared.num}>{preisText(pos)}</TableCell>
                    <TableCell>{laufzeitText(pos.laufzeitMonate)}</TableCell>
                    <TableCell className={shared.num} style={{ textAlign: 'left' }}>
                      {verrechnetBis ? formatDate(verrechnetBis) : <span className={shared.muted}>noch nie</span>}
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
                            {!data.positionMitZeilen[pos.id] && <MenuItem onClick={() => loeschen(pos)}>Löschen</MenuItem>}
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
        <RechnungenTable rechnungen={rechnungen} onShow={onShow} onEditDraft={onEditDraft} emptyText="Noch keine Rechnungen." />
      </section>

      <KundeDrawer open={kundeDrawer} kunde={kunde} onClose={() => setKundeDrawer(false)} />
      <PositionDrawer open={positionDrawer.open} kunde={kunde} position={positionDrawer.position} onClose={() => setPositionDrawer({ open: false })} />
      <KuendigenDialog position={kuendigen} onClose={() => setKuendigen(undefined)} />
      <ConfirmDialog request={confirm} onClose={() => setConfirm(undefined)} />
    </>
  );
}
