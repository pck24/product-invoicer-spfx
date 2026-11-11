import * as React from 'react';
import {
  Button,
  Checkbox,
  Field,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
  makeStyles,
  mergeClasses,
  tokens
} from '@fluentui/react-components';
import { Delete20Regular } from '@fluentui/react-icons';
import { formatDate, isIsoDate, todayIso } from '../../billing/dates';
import { formatAmount, formatEuro, formatMonate, parseEuro } from '../../billing/money';
import { IBilledLine } from '../../billing/types';
import { hasErrors, IValidationIssue, normalizeNumber, validateInvoice } from '../../billing/validation';
import { IRechnung, toBilledLines } from '../../data/mapping';
import { useApp } from '../AppContext';
import { errorText, useData } from '../DataContext';
import { DateField } from '../components/DateField';
import {
  applyDraft,
  buildRows,
  calcRow,
  draftTotals,
  IDraftRow,
  refreshDefaults,
  selectedRows,
  toSaveLines,
  toValidationLines
} from '../invoiceDraft';
import { useShared } from '../styles';

const useStyles = makeStyles({
  fields: { display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'flex-start', '& > *': { flex: '1 1 220px' }, '& label': { fontWeight: tokens.fontWeightSemibold } },
  dateCell: { width: '140px', paddingLeft: '4px', paddingRight: '4px' },
  amount: { width: '110px', '& input': { textAlign: 'right' } },
  disabledRow: { color: tokens.colorNeutralForeground4 },
  totals: {
    padding: '16px 20px',
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    justifyContent: 'flex-end'
  },
  dl: { margin: 0, display: 'grid', gridTemplateColumns: 'auto auto', columnGap: '32px', rowGap: '6px', fontVariantNumeric: 'tabular-nums', minWidth: '260px' },
  dd: { margin: 0, textAlign: 'right' },
  total: { fontWeight: tokens.fontWeightBold, paddingTop: '6px', borderTop: `1px solid ${tokens.colorNeutralStroke2}` },
  footer: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' },
  issues: { margin: '4px 0 0', paddingLeft: '18px' },
  rowIssue: { color: tokens.colorPaletteRedForeground1, display: 'block' },
  rowWarn: { color: tokens.colorPaletteMarigoldForeground3, display: 'block' },
  badge: { padding: '2px 8px', borderRadius: '4px', backgroundColor: tokens.colorBrandBackground2, color: tokens.colorBrandForeground2, fontSize: '13px' }
});

/** Betragsfeld: übernimmt den Wert beim Verlassen; leer = berechneter Betrag. */
function BetragInput({ cent, onCommit, label, className }: { cent: number; onCommit: (cent: number | null) => void; label: string; className: string }): React.ReactElement {
  const [text, setText] = React.useState(formatAmount(cent));
  React.useEffect(() => setText(formatAmount(cent)), [cent]);
  const commit = (): void => {
    if (!text.trim()) return onCommit(null);
    const v = parseEuro(text);
    if (v === null) setText(formatAmount(cent));
    else if (v !== cent) onCommit(v);
  };
  return (
    <Input
      className={className}
      aria-label={label}
      value={text}
      contentAfter="€"
      onChange={(_, d) => setText(d.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && commit()}
    />
  );
}

export interface IInvoiceWizardProps {
  kundeId: number;
  /** Entwurf, der weiterbearbeitet wird */
  rechnungId?: number;
  /** nach dem Speichern, mit der Id der Rechnung */
  onDone: (rechnungId: number) => void;
  onCancel: () => void;
}

export function InvoiceWizard({ kundeId, rechnungId, onDone, onCancel }: IInvoiceWizardProps): React.ReactElement {
  const s = useStyles();
  const shared = useShared();
  const { repo, settings } = useApp();
  const { data, reload, notify } = useData();

  const kunde = data ? data.kunden.filter((k) => k.id === kundeId)[0] : undefined;
  const entwurf = data && rechnungId ? data.rechnungen.filter((r) => r.id === rechnungId)[0] : undefined;
  const positionen = React.useMemo(() => (data ? data.positionen.filter((p) => p.kundeId === kundeId) : []), [data, kundeId]);
  /** bestehende Zeiträume ohne den gerade bearbeiteten Entwurf */
  const billed: IBilledLine[] = React.useMemo(() => {
    if (!data) return [];
    const ids = positionen.map((p) => p.id);
    return data.billedLines.filter((l) => l.positionId !== null && ids.indexOf(l.positionId) >= 0 && l.rechnungId !== rechnungId);
  }, [data, positionen, rechnungId]);
  const vorgaenger: IRechnung | undefined = data
    ? data.rechnungen
        .filter((r) => r.kundeId === kundeId && r.status === 'Erstellt' && r.id !== rechnungId)
        .sort((a, b) => (b.rechnungsdatum || '').localeCompare(a.rechnungsdatum || '') || b.id - a.id)[0]
    : undefined;

  const [nummer, setNummer] = React.useState(entwurf ? entwurf.nummer : '');
  const [datum, setDatum] = React.useState(entwurf && entwurf.rechnungsdatum ? entwurf.rechnungsdatum : todayIso());
  const [rows, setRows] = React.useState<IDraftRow[]>(() => {
    const base = buildRows(positionen, billed, datum);
    return entwurf && data ? applyDraft(base, data.rechnungspositionen.filter((l) => l.rechnungId === entwurf.id), positionen, billed) : base;
  });
  const [busy, setBusy] = React.useState<string | undefined>();
  const [saveIssues, setSaveIssues] = React.useState<IValidationIssue[] | undefined>();
  const [saveError, setSaveError] = React.useState<string | undefined>();
  const nextKey = React.useRef(0);

  // Live-Prüfung
  const otherNumbers = data ? data.rechnungen.filter((r) => r.id !== rechnungId).map((r) => r.nummer) : [];
  const issues: IValidationIssue[] = React.useMemo(() => {
    const list = validateInvoice({
      invoiceNumber: nummer,
      existingInvoiceNumbers: otherNumbers,
      lines: toValidationLines(rows),
      positions: positionen,
      billedLines: billed
    });
    if (!isIsoDate(datum)) list.push({ severity: 'error', message: 'Rechnungsdatum fehlt.' });
    if (selectedRows(rows).length === 0) list.push({ severity: 'error', message: 'Keine Position ausgewählt.' });
    for (const r of selectedRows(rows)) {
      if (r.positionId === null && !calcRow(r, positionen, billed).complete) {
        list.push({ severity: 'error', lineKey: r.key, message: `${r.title || 'Einmalige Position'}: Bezeichnung und Betrag angeben.` });
      }
    }
    return list;
  }, [nummer, datum, rows, positionen, billed, otherNumbers.join('|')]);
  const shown = saveIssues || issues;
  const errors = shown.filter((i) => i.severity === 'error');
  const warnings = shown.filter((i) => i.severity === 'warning');
  const nummerDoppelt = !!nummer.trim() && otherNumbers.some((n) => normalizeNumber(n) === normalizeNumber(nummer));
  const t = draftTotals(rows, positionen, billed, settings.ustSatz);

  if (!data || !kunde) return <p>Kunde nicht gefunden.</p>;
  if (rechnungId && (!entwurf || entwurf.status !== 'Entwurf')) {
    return (
      <MessageBar intent="warning">
        <MessageBarBody>Diese Rechnung ist kein Entwurf mehr und kann nicht bearbeitet werden.</MessageBarBody>
      </MessageBar>
    );
  }

  const update = (key: string, patch: Partial<IDraftRow>): void => {
    setSaveIssues(undefined);
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // Neue Position: sobald Von und Bis gesetzt sind, automatisch anhaken
        if (next.kind === 'neu' && !next.touched && isIsoDate(next.von) && isIsoDate(next.bis)) next.checked = true;
        return next;
      })
    );
  };

  const changeDatum = (v: string): void => {
    setDatum(v);
    setSaveIssues(undefined);
    setRows((rs) => refreshDefaults(rs, v));
  };

  const addEinmalig = (): void => {
    const key = `e${nextKey.current++}-${Date.now()}`;
    setRows((rs) => rs.concat({ key, kind: 'einmalig', positionId: null, title: '', von: '', bis: '', checked: true, touched: true, betragOverrideCent: null }));
  };

  const save = async (status: 'Entwurf' | 'Erstellt'): Promise<void> => {
    if (hasErrors(issues)) return;
    setBusy(status === 'Entwurf' ? 'Entwurf wird gespeichert …' : 'Rechnung wird erstellt …');
    setSaveError(undefined);
    setSaveIssues(undefined);
    try {
      // Neuprüfung gegen frisch gelesene Daten
      const [rechnungen, rpos] = await Promise.all([repo.getRechnungen(), repo.getRechnungspositionen({ positionIds: positionen.map((p) => p.id) })]);
      const fresh = toBilledLines(rpos, rechnungen).filter((l) => l.rechnungId !== rechnungId);
      const freshIssues = validateInvoice({
        invoiceNumber: nummer,
        existingInvoiceNumbers: rechnungen.filter((r) => r.id !== rechnungId).map((r) => r.nummer),
        lines: toValidationLines(rows),
        positions: positionen,
        billedLines: fresh
      });
      if (hasErrors(freshIssues)) {
        setSaveIssues(freshIssues);
        return;
      }
      const header = {
        nummer: nummer.trim(),
        kundeId,
        rechnungsdatum: datum,
        vorgaengerId: vorgaenger ? vorgaenger.id : null,
        status,
        summeNettoCent: draftTotals(rows, positionen, fresh, settings.ustSatz).nettoCent
      };
      const lines = toSaveLines(rows, positionen, fresh);
      const saved = rechnungId ? await repo.updateEntwurf(rechnungId, header, lines) : await repo.createRechnung(header, lines);
      await reload();
      notify(status === 'Entwurf' ? `Entwurf ${header.nummer} gespeichert` : `Rechnung ${header.nummer} erstellt`);
      onDone(saved.id);
    } catch (e) {
      setSaveError(errorText(e));
    } finally {
      setBusy(undefined);
    }
  };

  const issuesFor = (key: string): IValidationIssue[] => shown.filter((i) => i.lineKey === key);
  const ersteRechnung = !vorgaenger;

  return (
    <>
      <header className={mergeClasses(shared.card, shared.cardPadded)}>
        <div>
          <h1 className={shared.h1}>{entwurf ? `Entwurf ${entwurf.nummer} bearbeiten` : ersteRechnung ? 'Erste Rechnung erstellen' : 'Folgerechnung erstellen'}</h1>
          <p className={shared.muted} style={{ margin: 0 }}>
            {kunde.name} ({kunde.kundennummer})
            {vorgaenger && ` · schließt an ${vorgaenger.nummer} vom ${formatDate(vorgaenger.rechnungsdatum)} an`}
          </p>
        </div>
        <div className={s.fields}>
          <Field
            label="Rechnungsnummer"
            required
            hint="aus deinem Rechnungssystem"
            validationMessage={nummerDoppelt ? 'Diese Rechnungsnummer existiert bereits.' : undefined}
          >
            <Input value={nummer} onChange={(_, d) => setNummer(d.value)} />
          </Field>
          <DateField label="Rechnungsdatum" required value={datum} onChange={changeDatum} hint="bestimmt, welche Folgezeiträume vorausgewählt sind" />
        </div>
      </header>

      {errors.length > 0 ? (
        <MessageBar intent="error" layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>{saveIssues ? 'Speichern abgebrochen – die Daten haben sich geändert' : 'Prüfung nicht bestanden'}</MessageBarTitle>
            <ul className={s.issues}>
              {errors.map((i, n) => (
                <li key={n}>{i.message}</li>
              ))}
            </ul>
          </MessageBarBody>
        </MessageBar>
      ) : warnings.length > 0 ? (
        <MessageBar intent="warning" layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>Prüfung bestanden, mit Hinweisen</MessageBarTitle>
            <ul className={s.issues}>
              {warnings.map((i, n) => (
                <li key={n}>{i.message}</li>
              ))}
            </ul>
          </MessageBarBody>
        </MessageBar>
      ) : (
        <MessageBar intent="success" layout="multiline">
          <MessageBarBody>
            <MessageBarTitle>Prüfung bestanden</MessageBarTitle>
            Keine Überschneidung mit bereits verrechneten Zeiträumen. Alle Zeiträume schließen lückenlos an „verrechnet bis“ an.
          </MessageBarBody>
        </MessageBar>
      )}
      {saveError && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Speichern fehlgeschlagen</MessageBarTitle>
            {saveError}
          </MessageBarBody>
        </MessageBar>
      )}

      <section className={shared.card} aria-labelledby="vorschlag-title">
        <div className={shared.cardHeader}>
          <h2 id="vorschlag-title" className={shared.h2}>
            Positionen
          </h2>
          <Button onClick={addEinmalig}>+ Einmalige Position</Button>
        </div>
        <div className={shared.tableWrap}>
          <Table className={shared.table} aria-label="Positionen der Rechnung">
            <TableHeader>
              <TableRow>
                <TableHeaderCell style={{ width: '44px' }} aria-label="Übernehmen" />
                <TableHeaderCell>Position</TableHeaderCell>
                <TableHeaderCell className={s.dateCell}>Von</TableHeaderCell>
                <TableHeaderCell className={s.dateCell}>Bis</TableHeaderCell>
                <TableHeaderCell className={mergeClasses(shared.num, shared.numHead)}>Monate</TableHeaderCell>
                <TableHeaderCell className={mergeClasses(shared.num, shared.numHead)}>Jahrespreis</TableHeaderCell>
                <TableHeaderCell className={mergeClasses(shared.num, shared.numHead)}>Betrag</TableHeaderCell>
                <TableHeaderCell>Hinweis</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className={shared.muted}>
                    Dieser Kunde hat noch keine Positionen.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r) => {
                const c = calcRow(r, positionen, billed);
                const disabled = r.kind === 'entfaellt';
                const rowIssues = issuesFor(r.key);
                return (
                  <TableRow key={r.key} className={disabled || !r.checked ? s.disabledRow : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={r.checked}
                        disabled={disabled}
                        aria-label={`${r.title || 'Einmalige Position'} übernehmen`}
                        onChange={(_, d) => update(r.key, { checked: !!d.checked, touched: true })}
                      />
                    </TableCell>
                    <TableCell className={shared.strong}>
                      {r.kind === 'einmalig' ? (
                        <Input aria-label="Bezeichnung" placeholder="Bezeichnung" value={r.title} onChange={(_, d) => update(r.key, { title: d.value })} />
                      ) : (
                        <span className={disabled ? shared.strike : undefined}>
                          {r.title}
                          {c.menge !== 1 && ` × ${String(c.menge).replace('.', ',')}`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={s.dateCell}>
                      {disabled ? '–' : <DateField bare label={`${r.title} von`} value={r.von} onChange={(v) => update(r.key, { von: v, betragOverrideCent: r.positionId === null ? r.betragOverrideCent : null })} />}
                    </TableCell>
                    <TableCell className={s.dateCell}>
                      {disabled ? '–' : <DateField bare label={`${r.title} bis`} value={r.bis} onChange={(v) => update(r.key, { bis: v, betragOverrideCent: r.positionId === null ? r.betragOverrideCent : null })} />}
                    </TableCell>
                    <TableCell className={shared.num}>{c.complete && r.positionId !== null ? formatMonate(c.monateX100) : '–'}</TableCell>
                    <TableCell className={shared.num}>{r.positionId !== null ? formatEuro(c.einzelpreisCent) : '–'}</TableCell>
                    <TableCell className={shared.num}>
                      {disabled || (r.positionId !== null && !c.complete) ? (
                        '–'
                      ) : (
                        <BetragInput cent={c.betragCent} className={s.amount} label={`${r.title} Betrag`} onCommit={(v) => update(r.key, { betragOverrideCent: v })} />
                      )}
                    </TableCell>
                    <TableCell>
                      {c.hinweis === 'erste Verrechnung – Zeitraum frei wählen' ? <span className={s.badge}>{c.hinweis}</span> : <span className={shared.muted}>{c.hinweis}</span>}
                      {r.betragOverrideCent !== null && r.positionId !== null && <span className={shared.muted}> · Betrag manuell</span>}
                      {rowIssues.map((i, n) => (
                        <span key={n} className={i.severity === 'error' ? s.rowIssue : s.rowWarn}>
                          {i.message}
                        </span>
                      ))}
                      {r.kind === 'einmalig' && (
                        <Button
                          appearance="subtle"
                          size="small"
                          icon={<Delete20Regular />}
                          aria-label="Einmalige Position entfernen"
                          onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <div className={s.totals}>
          <dl className={s.dl}>
            <dt className={shared.muted}>Summe netto</dt>
            <dd className={s.dd}>{formatEuro(t.nettoCent)}</dd>
            <dt className={shared.muted}>USt. {String(settings.ustSatz).replace('.', ',')} %</dt>
            <dd className={s.dd}>{formatEuro(t.ustCent)}</dd>
            <dt className={s.total}>Gesamt brutto</dt>
            <dd className={mergeClasses(s.dd, s.total)}>{formatEuro(t.bruttoCent)}</dd>
          </dl>
        </div>
      </section>

      <footer className={s.footer}>
        <p className={shared.muted} style={{ margin: 0, maxWidth: '560px' }}>
          Die Zeiträume werden als Rechnungspositionen gespeichert. „Verrechnet bis“ ergibt sich daraus automatisch.
        </p>
        <div className={shared.row}>
          {busy && <Spinner size="tiny" label={busy} />}
          <Button onClick={onCancel} disabled={!!busy}>
            Abbrechen
          </Button>
          <Button onClick={() => save('Entwurf')} disabled={!!busy || hasErrors(issues)}>
            Als Entwurf speichern
          </Button>
          <Button appearance="primary" onClick={() => save('Erstellt')} disabled={!!busy || hasErrors(issues)}>
            Rechnung erstellen
          </Button>
        </div>
      </footer>
    </>
  );
}
