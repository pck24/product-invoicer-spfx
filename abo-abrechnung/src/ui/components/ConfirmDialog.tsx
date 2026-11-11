import * as React from 'react';
import { Button, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle } from '@fluentui/react-components';

export interface IConfirmRequest {
  title: string;
  message: string;
  confirmText: string;
  onConfirm: () => Promise<void> | void;
}

/** Bestätigungsdialog; offen, solange request gesetzt ist. */
export function ConfirmDialog({ request, onClose }: { request: IConfirmRequest | undefined; onClose: () => void }): React.ReactElement {
  const [busy, setBusy] = React.useState(false);
  const confirm = async (): Promise<void> => {
    if (!request) return;
    setBusy(true);
    try {
      await request.onConfirm();
    } finally {
      setBusy(false);
      onClose();
    }
  };
  return (
    <Dialog open={!!request} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{request ? request.title : ''}</DialogTitle>
          <DialogContent>{request ? request.message : ''}</DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Abbrechen</Button>
            <Button appearance="primary" disabled={busy} onClick={() => confirm()}>
              {request ? request.confirmText : 'OK'}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
