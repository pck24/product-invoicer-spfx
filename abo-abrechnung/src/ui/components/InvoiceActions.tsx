import * as React from 'react';
import { Button, Menu, MenuDivider, MenuItem, MenuList, MenuPopover, MenuTrigger, Spinner } from '@fluentui/react-components';
import { MoreHorizontal20Regular } from '@fluentui/react-icons';
import { IRechnung } from '../../data/mapping';
import { useApp } from '../AppContext';
import { errorText, useData } from '../DataContext';
import { useExport } from '../useExport';
import { ConfirmDialog, IConfirmRequest } from './ConfirmDialog';

export interface IInvoiceActionsProps {
  rechnung: IRechnung;
  onEditDraft: (rechnung: IRechnung) => void;
  /** "Anzeigen" im Menü (nicht im Anzeige-Screen selbst) */
  onShow?: (rechnung: IRechnung) => void;
  /** nach dem Löschen eines Entwurfs (z. B. zurück zum Kunden) */
  onDeleted?: () => void;
  /** Beschriftung des Menüknopfs; ohne = nur "…" */
  label?: string;
}

/** Menü einer Rechnung: Anzeigen, PDF, Entwurf bearbeiten/löschen, Stornieren. */
export function InvoiceActions({ rechnung, onEditDraft, onShow, onDeleted, label }: IInvoiceActionsProps): React.ReactElement {
  const { repo } = useApp();
  const { data, reload, notify } = useData();
  const exp = useExport();
  const [confirm, setConfirm] = React.useState<IConfirmRequest | undefined>();

  const run = async (action: () => Promise<void>, ok: string, after?: () => void): Promise<void> => {
    try {
      await action();
      if (after) after();
      await reload();
      notify(ok);
    } catch (e) {
      notify(errorText(e), 'error');
    }
  };

  // Klicks (auch aus Menü- und Dialog-Portalen) nicht an eine klickbare Tabellenzeile weiterreichen
  return (
    <span onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
      {exp.busy && <Spinner size="tiny" label={exp.busy} />}
      <Menu positioning="below-end">
        <MenuTrigger disableButtonEnhancement>
          <Button
            appearance={label ? 'secondary' : 'subtle'}
            icon={<MoreHorizontal20Regular />}
            aria-label={`Aktionen für ${rechnung.nummer}`}
            onClick={(e) => e.stopPropagation()}
          >
            {label}
          </Button>
        </MenuTrigger>
        <MenuPopover onClick={(e) => e.stopPropagation()}>
          <MenuList>
            {onShow && <MenuItem onClick={() => onShow(rechnung)}>Anzeigen</MenuItem>}
            {rechnung.pdfUrl && <MenuItem onClick={() => window.open(rechnung.pdfUrl as string, '_blank')}>Export öffnen</MenuItem>}
            <MenuItem disabled={!!exp.busy || !data} onClick={() => data && exp.run(data, rechnung.id, 'mitKosten', true)}>
              Mit Kosten exportieren
            </MenuItem>
            <MenuItem disabled={!!exp.busy || !data} onClick={() => data && exp.run(data, rechnung.id, 'ohneKosten', true)}>
              Ohne Kosten exportieren
            </MenuItem>
            {rechnung.status === 'Entwurf' && <MenuItem onClick={() => onEditDraft(rechnung)}>Entwurf bearbeiten</MenuItem>}
            {rechnung.status !== 'Storniert' && <MenuDivider />}
            {rechnung.status === 'Entwurf' && (
              <MenuItem
                onClick={() =>
                  setConfirm({
                    title: 'Entwurf löschen',
                    message: `Der Entwurf ${rechnung.nummer} und seine Zeiträume werden endgültig gelöscht.`,
                    confirmText: 'Löschen',
                    onConfirm: () => run(() => repo.deleteEntwurf(rechnung.id), `Entwurf ${rechnung.nummer} gelöscht`, onDeleted)
                  })
                }
              >
                Entwurf löschen
              </MenuItem>
            )}
            {rechnung.status === 'Erstellt' && (
              <MenuItem
                onClick={() =>
                  setConfirm({
                    title: 'Rechnung stornieren',
                    message: `Rechnung ${rechnung.nummer} wird storniert. Sie bleibt erhalten, ihre Zeiträume sind danach wieder frei und können neu verrechnet werden.`,
                    confirmText: 'Stornieren',
                    onConfirm: () => run(() => repo.stornieren(rechnung.id), `Rechnung ${rechnung.nummer} storniert`)
                  })
                }
              >
                Stornieren
              </MenuItem>
            )}
          </MenuList>
        </MenuPopover>
      </Menu>
      <ConfirmDialog request={confirm} onClose={() => setConfirm(undefined)} />
    </span>
  );
}
