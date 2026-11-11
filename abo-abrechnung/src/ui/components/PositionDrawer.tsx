import * as React from 'react';
import {
  Button,
  Combobox,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Option,
  OverlayDrawer,
  Text
} from '@fluentui/react-components';
import { Dismiss24Regular } from '@fluentui/react-icons';
import { formatAmount, parseEuro } from '../../billing/money';
import { IPosition } from '../../billing/types';
import { IKunde, IPositionItem } from '../../data/mapping';
import { useApp } from '../AppContext';
import { errorText, useData } from '../DataContext';
import { previewText } from '../derive';
import { useShared } from '../styles';

export interface IPositionDrawerProps {
  open: boolean;
  kunde: IKunde;
  position?: IPositionItem;
  onClose: () => void;
}

interface IForm {
  title: string;
  menge: string;
  preis: string;
  laufzeit: string;
}

function toForm(p?: IPositionItem): IForm {
  return {
    title: p ? p.title : '',
    menge: p ? String(p.menge).replace('.', ',') : '1',
    preis: p ? formatAmount(p.jahrespreisCent) : '',
    laufzeit: p ? String(p.laufzeitMonate) : '12'
  };
}

export function PositionDrawer({ open, kunde, position, onClose }: IPositionDrawerProps): React.ReactElement {
  const { repo } = useApp();
  const { data, reload, notify } = useData();
  const shared = useShared();
  const [form, setForm] = React.useState<IForm>(toForm(position));
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (!open) return;
    setForm(toForm(position));
    setTouched(false);
    setError(undefined);
  }, [open, position]);

  const set = (patch: Partial<IForm>): void => setForm((f) => ({ ...f, ...patch }));

  /** Vorschläge: Bezeichnungen bestehender Positionen, je Bezeichnung die zuletzt angelegte. */
  const vorlagen = React.useMemo(() => {
    const map: { [title: string]: IPositionItem } = {};
    for (const p of data ? data.positionen : []) if (!map[p.title] || map[p.title].id < p.id) map[p.title] = p;
    return Object.keys(map)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => map[k]);
  }, [data]);

  const filtered = vorlagen.filter((v) => v.title.toLowerCase().indexOf(form.title.toLowerCase()) >= 0).slice(0, 20);

  const lines = React.useMemo(
    () => (data && position ? data.billedLines.filter((l) => l.positionId === position.id) : []),
    [data, position]
  );

  // Validierung
  const preisCent = parseEuro(form.preis);
  const menge = Number(form.menge.replace(',', '.'));
  const laufzeit = Number(form.laufzeit);
  const errors: { [k: string]: string | undefined } = {
    title: !form.title.trim() ? 'Bezeichnung ist erforderlich.' : undefined,
    menge: !(menge > 0) ? 'Menge muss größer als 0 sein.' : undefined,
    preis: preisCent === null || preisCent < 0 ? 'Jahrespreis im Format 24,00 eingeben.' : undefined,
    laufzeit: !(laufzeit >= 1) || Math.round(laufzeit) !== laufzeit ? 'Ganze Monate ab 1 eingeben.' : undefined
  };
  const valid = Object.keys(errors).every((k) => !errors[k]);
  const show = (k: string): string | undefined => (touched ? errors[k] : undefined);

  const candidate: IPosition | undefined = valid
    ? {
        id: position ? position.id : -1,
        title: form.title.trim(),
        menge,
        jahrespreisCent: preisCent as number,
        laufzeitMonate: laufzeit,
        // Kündigung wird nur über "Kündigen" gesetzt und beim Bearbeiten beibehalten
        ende: position ? position.ende : null
      }
    : undefined;
  const preview = candidate ? previewText(candidate, lines) : '';

  const applyVorlage = (title: string): void => {
    const v = vorlagen.filter((x) => x.title === title)[0];
    if (!v) return set({ title });
    set({ title, preis: formatAmount(v.jahrespreisCent), laufzeit: String(v.laufzeitMonate) });
  };

  const save = async (): Promise<void> => {
    setTouched(true);
    if (!candidate) return;
    setBusy(true);
    setError(undefined);
    try {
      const { id, ...rest } = candidate;
      await repo.savePosition({ ...rest, kundeId: kunde.id }, position ? id : undefined);
      await reload();
      notify(position ? 'Position gespeichert' : 'Position angelegt');
      onClose();
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
          {position ? 'Position bearbeiten' : 'Position anlegen'}
        </DrawerHeaderTitle>
        <Text className={shared.muted}>
          {kunde.name} · {kunde.kundennummer}
        </Text>
      </DrawerHeader>
      <DrawerBody>
        <form
          className={shared.form}
          onSubmit={(e) => {
            e.preventDefault();
            save().catch(() => undefined);
          }}
        >
          <Field label="Bezeichnung" required validationMessage={show('title')} hint="Vorschläge übernehmen Jahrespreis und Laufzeit.">
            <Combobox
              freeform
              value={form.title}
              selectedOptions={[form.title]}
              onChange={(e) => set({ title: (e.target as HTMLInputElement).value })}
              onOptionSelect={(_, d) => d.optionValue && applyVorlage(d.optionValue)}
            >
              {filtered.map((v) => (
                <Option key={v.title} value={v.title}>
                  {v.title}
                </Option>
              ))}
            </Combobox>
          </Field>

          <div className={shared.formRow}>
            <Field label="Menge" validationMessage={show('menge')}>
              <Input inputMode="decimal" value={form.menge} onChange={(_, d) => set({ menge: d.value })} />
            </Field>
            <Field label="Jahrespreis (€)" validationMessage={show('preis')}>
              <Input inputMode="decimal" value={form.preis} onChange={(_, d) => set({ preis: d.value })} />
            </Field>
            <Field label="Laufzeit (Monate)" validationMessage={show('laufzeit')}>
              <Input type="number" min={1} value={form.laufzeit} onChange={(_, d) => set({ laufzeit: d.value })} />
            </Field>
          </div>


          {preview && (
            <MessageBar intent="info" layout="multiline">
              <MessageBarBody>
                <MessageBarTitle>Vorschau</MessageBarTitle>
                {preview}
              </MessageBarBody>
            </MessageBar>
          )}
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
