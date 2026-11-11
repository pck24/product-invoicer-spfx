import * as React from 'react';
import {
  Button,
  Dropdown,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  Option,
  OverlayDrawer,
  Textarea
} from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import { suggestNumber } from '../../billing/numbering';
import { IKunde } from '../../data/mapping';
import { useApp } from '../AppContext';
import { errorText, useData } from '../DataContext';
import { MONATE } from '../derive';
import { useShared } from '../styles';

export interface IKundeDrawerProps {
  open: boolean;
  kunde?: IKunde;
  onClose: () => void;
  onSaved?: (kunde: IKunde) => void;
}

export function KundeDrawer({ open, kunde, onClose, onSaved }: IKundeDrawerProps): React.ReactElement {
  const { repo } = useApp();
  const { data, reload, notify } = useData();
  const shared = useShared();
  const andere = React.useMemo(() => (data ? data.kunden.filter((k) => !kunde || k.id !== kunde.id) : []), [data, kunde]);

  const [name, setName] = React.useState('');
  const [nummer, setNummer] = React.useState('');
  const [adresse, setAdresse] = React.useState('');
  const [monat, setMonat] = React.useState(1);
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (!open) return;
    setName(kunde ? kunde.name : '');
    setNummer(kunde ? kunde.kundennummer : suggestNumber('K-{NNNN}', andere.map((k) => k.kundennummer), new Date().getFullYear()));
    setAdresse(kunde ? kunde.adresse : '');
    setMonat(kunde ? kunde.stichtagMonat : 1);
    setTouched(false);
    setError(undefined);
  }, [open, kunde]);

  const nummerTrim = nummer.trim();
  const doppelt = andere.some((k) => k.kundennummer.trim().toUpperCase() === nummerTrim.toUpperCase());
  const nameFehler = touched && !name.trim() ? 'Name ist erforderlich.' : undefined;
  const nummerFehler = !nummerTrim ? (touched ? 'Kundennummer ist erforderlich.' : undefined) : doppelt ? 'Diese Kundennummer existiert bereits.' : undefined;

  const save = async (): Promise<void> => {
    setTouched(true);
    if (!name.trim() || !nummerTrim || doppelt) return;
    setBusy(true);
    setError(undefined);
    try {
      const saved = await repo.saveKunde(
        { name: name.trim(), kundennummer: nummerTrim, adresse: adresse.trim(), stichtagMonat: monat, aktiv: kunde ? kunde.aktiv : true },
        kunde && kunde.id
      );
      await reload();
      notify(kunde ? 'Kunde gespeichert' : 'Kunde angelegt');
      onClose();
      if (onSaved) onSaved(saved);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OverlayDrawer open={open} position="end" size="medium" onOpenChange={(_, d) => !d.open && onClose()}>
      <DrawerHeader>
        <DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Schließen" icon={<Dismiss24Regular />} onClick={onClose} />}>
          {kunde ? 'Kunde bearbeiten' : 'Kunde anlegen'}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <form
          className={shared.form}
          onSubmit={(e) => {
            e.preventDefault();
            save().catch(() => undefined);
          }}
        >
          <Field label="Name" required validationMessage={nameFehler}>
            <Input value={name} onChange={(_, d) => setName(d.value)} />
          </Field>
          <Field label="Kundennummer" required validationMessage={nummerFehler}>
            <Input value={nummer} onChange={(_, d) => setNummer(d.value)} />
          </Field>
          <Field label="Adresse">
            <Textarea value={adresse} rows={3} resize="vertical" onChange={(_, d) => setAdresse(d.value)} />
          </Field>
          <Field
            label="Jährliche Rechnung im"
            hint="Monatsdienste werden für 12 Monate ab dem 1. dieses Monats verrechnet. Positionen mit eigener Laufzeit (z. B. Domains) kommen mit auf die Rechnung, sobald ihre Verlängerung in diese 12 Monate fällt."
          >
            <Dropdown
              value={MONATE[monat - 1]}
              selectedOptions={[String(monat)]}
              onOptionSelect={(_, d) => setMonat(Number(d.optionValue) || 1)}
            >
              {MONATE.map((m, i) => (
                <Option key={m} value={String(i + 1)}>
                  {m}
                </Option>
              ))}
            </Dropdown>
          </Field>
          {error && (
            <MessageBar intent="error">
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
          )}
          <button type="submit" hidden />
        </form>
      </DrawerBody>
      <DrawerFooter>
        <Button onClick={onClose}>Abbrechen</Button>
        <Button appearance="primary" disabled={busy} onClick={() => save()}>
          {busy ? 'Speichert …' : 'Speichern'}
        </Button>
      </DrawerFooter>
    </OverlayDrawer>
  );
}
