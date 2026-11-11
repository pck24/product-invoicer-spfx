import * as React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody
} from '@fluentui/react-components';
import { formatDate, isIsoDate, todayIso } from '../../billing/dates';
import { verrechnetBis } from '../../billing/proposal';
import { IPositionItem } from '../../data/mapping';
import { useApp } from '../AppContext';
import { errorText, useData } from '../DataContext';

export interface IKuendigenDialogProps {
  position: IPositionItem | undefined;
  onClose: () => void;
}

/** Setzt das Leistungsende einer Position. */
export function KuendigenDialog({ position, onClose }: IKuendigenDialogProps): React.ReactElement {
  const { repo } = useApp();
  const { data, reload, notify } = useData();
  const [ende, setEnde] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();
  const vb = position && data ? verrechnetBis(position.id, data.billedLines) : null;

  React.useEffect(() => {
    if (position) {
      setEnde(position.ende || vb || todayIso());
      setError(undefined);
    }
  }, [position]);

  const fehler = !position
    ? undefined
    : !isIsoDate(ende)
      ? 'Datum eingeben.'
      : ende < position.beginn
        ? 'Ende liegt vor dem Beginn.'
        : vb && ende < vb
          ? `Bereits verrechnet bis ${formatDate(vb)} – Ende darf nicht davor liegen.`
          : undefined;

  const save = async (): Promise<void> => {
    if (!position || fehler) return;
    setBusy(true);
    try {
      const { id, ...rest } = position;
      await repo.savePosition({ ...rest, ende }, id);
      await reload();
      notify(`${position.title} gekündigt zum ${formatDate(ende)}`);
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={!!position} onOpenChange={(_, d) => !d.open && onClose()}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>Position kündigen</DialogTitle>
          <DialogContent>
            <Field label={`Leistungsende für „${position ? position.title : ''}“`} validationMessage={fehler}>
              <Input type="date" value={ende} onChange={(_, d) => setEnde(d.value)} />
            </Field>
            {error && (
              <MessageBar intent="error">
                <MessageBarBody>{error}</MessageBarBody>
              </MessageBar>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Abbrechen</Button>
            <Button appearance="primary" disabled={busy || !!fehler} onClick={() => save()}>
              Kündigen
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
