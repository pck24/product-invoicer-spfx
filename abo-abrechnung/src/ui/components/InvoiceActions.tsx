import * as React from 'react';
import { Button, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger } from '@fluentui/react-components';
import { MoreHorizontal20Regular } from '@fluentui/react-icons';
import { IRechnung } from '../../data/mapping';
import { useApp } from '../AppContext';
import { errorText, useData } from '../DataContext';
import { ConfirmDialog, IConfirmRequest } from './ConfirmDialog';

export interface IInvoiceActionsProps {
  rechnung: IRechnung;
  onEditDraft: (rechnung: IRechnung) => void;
}

/** Zeilenmenü einer Rechnung: PDF öffnen, Entwurf bearbeiten/löschen, Stornieren. */
export function InvoiceActions({ rechnung, onEditDraft }: IInvoiceActionsProps): React.ReactElement {
  const { repo } = useApp();
  const { reload, notify } = useData();
  const [confirm, setConfirm] = React.useState<IConfirmRequest | undefined>();

  const run = async (action: () => Promise<void>, ok: string): Promise<void> => {
    try {
      await action();
      await reload();
      notify(ok);
    } catch (e) {
      notify(errorText(e), 'error');
    }
  };

  return (
    <>
      <Menu>
        <MenuTrigger disableButtonEnhancement>
          <Button appearance="subtle" icon={<MoreHorizontal20Regular />} aria-label={`Aktionen für ${rechnung.nummer}`} />
        </MenuTrigger>
        <MenuPopover>
          <MenuList>
            {rechnung.pdfUrl && <MenuItem onClick={() => window.open(rechnung.pdfUrl as string, '_blank')}>PDF öffnen</MenuItem>}
            {rechnung.status === 'Entwurf' && <MenuItem onClick={() => onEditDraft(rechnung)}>Entwurf bearbeiten</MenuItem>}
            {rechnung.status === 'Entwurf' && (
              <MenuItem
                onClick={() =>
                  setConfirm({
                    title: 'Entwurf löschen',
                    message: `Der Entwurf ${rechnung.nummer} und seine Zeiträume werden endgültig gelöscht.`,
                    confirmText: 'Löschen',
                    onConfirm: () => run(() => repo.deleteEntwurf(rechnung.id), `Entwurf ${rechnung.nummer} gelöscht`)
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
            {rechnung.status === 'Storniert' && !rechnung.pdfUrl && <MenuItem disabled>Keine Aktionen</MenuItem>}
          </MenuList>
        </MenuPopover>
      </Menu>
      <ConfirmDialog request={confirm} onClose={() => setConfirm(undefined)} />
    </>
  );
}
