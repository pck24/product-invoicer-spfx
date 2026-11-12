import * as React from 'react';
import { Link, Toast, ToastBody, ToastTitle, Toaster, useId, useToastController } from '@fluentui/react-components';
import { todayIso } from '../billing/dates';
import { IBilledLine } from '../billing/types';
import { IKunde, IPositionItem, IRechnung, IRechnungsposition, toBilledLines } from '../data/mapping';
import { useApp } from './AppContext';
import { ICustomerSummary, summarizeAll } from './derive';

export interface IAppData {
  kunden: IKunde[];
  positionen: IPositionItem[];
  rechnungen: IRechnung[];
  rechnungspositionen: IRechnungsposition[];
  billedLines: IBilledLine[];
  /** Nachschlagetabellen, einmal je Datenstand aufgebaut */
  kundeById: { [id: number]: IKunde };
  rechnungById: { [id: number]: IRechnung };
  zeilenJeRechnung: { [rechnungId: number]: IRechnungsposition[] };
  /** Positionen, auf die mindestens eine Rechnungsposition verweist (auch storniert) */
  positionMitZeilen: { [positionId: number]: boolean };
}

/** Baut die abgeleiteten Daten und Nachschlagetabellen. */
export function indexData(kunden: IKunde[], positionen: IPositionItem[], rechnungen: IRechnung[], rechnungspositionen: IRechnungsposition[]): IAppData {
  const kundeById: IAppData['kundeById'] = {};
  for (const k of kunden) kundeById[k.id] = k;
  const rechnungById: IAppData['rechnungById'] = {};
  for (const r of rechnungen) rechnungById[r.id] = r;
  const zeilenJeRechnung: IAppData['zeilenJeRechnung'] = {};
  const positionMitZeilen: IAppData['positionMitZeilen'] = {};
  for (const l of rechnungspositionen) {
    if (l.rechnungId !== null) (zeilenJeRechnung[l.rechnungId] = zeilenJeRechnung[l.rechnungId] || []).push(l);
    if (l.positionId !== null) positionMitZeilen[l.positionId] = true;
  }
  return {
    kunden,
    positionen,
    rechnungen,
    rechnungspositionen,
    billedLines: toBilledLines(rechnungspositionen, rechnungen),
    kundeById,
    rechnungById,
    zeilenJeRechnung,
    positionMitZeilen
  };
}

export interface IDataContext {
  data: IAppData | undefined;
  /** Zusammenfassung aller Kunden (heute), einmal je Datenstand berechnet */
  summaries: ICustomerSummary[];
  loading: boolean;
  error: string | undefined;
  /** lädt neu und liefert die frischen Daten */
  reload: () => Promise<IAppData | undefined>;
  /** ändert eine Rechnung nur lokal (nach einem bereits gespeicherten Update), ohne neu zu laden */
  patchRechnung: (id: number, patch: Partial<IRechnung>) => void;
  notify: (title: string, intent?: 'success' | 'error' | 'info' | 'warning', link?: IToastLink) => void;
}

export interface IToastLink {
  text: string;
  url?: string;
  onClick?: () => void;
}

const Ctx = React.createContext<IDataContext | undefined>(undefined);

export function useData(): IDataContext {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error('DataContext fehlt');
  return ctx;
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Lädt alle 4 Listen auf einmal (kleine Datenmengen) und stellt Toasts bereit. */
export function DataProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const { repo } = useApp();
  const toasterId = useId('toaster');
  const { dispatchToast } = useToastController(toasterId);
  const [data, setData] = React.useState<IAppData | undefined>();
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | undefined>();

  const reload = React.useCallback(async (): Promise<IAppData | undefined> => {
    setLoading(true);
    setError(undefined);
    try {
      const [kunden, positionen, rechnungen, rechnungspositionen] = await Promise.all([
        repo.getKunden(),
        repo.getPositionen(),
        repo.getRechnungen(),
        repo.getRechnungspositionen()
      ]);
      kunden.sort((a, b) => a.kundennummer.localeCompare(b.kundennummer));
      const fresh = indexData(kunden, positionen, rechnungen, rechnungspositionen);
      setData(fresh);
      return fresh;
    } catch (e) {
      setError(errorText(e));
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [repo]);

  React.useEffect(() => {
    reload().catch(() => undefined);
  }, [reload]);

  const notify = React.useCallback<IDataContext['notify']>(
    (title, intent = 'success', link) => {
      dispatchToast(
        <Toast>
          <ToastTitle>{title}</ToastTitle>
          {link && (
            <ToastBody>
              {link.url ? (
                <Link href={link.url} target="_blank" rel="noreferrer">
                  {link.text}
                </Link>
              ) : (
                <Link as="button" onClick={link.onClick}>
                  {link.text}
                </Link>
              )}
            </ToastBody>
          )}
        </Toast>,
        { intent }
      );
    },
    [dispatchToast]
  );

  const patchRechnung = React.useCallback((id: number, patch: Partial<IRechnung>) => {
    setData((d) =>
      d ? indexData(d.kunden, d.positionen, d.rechnungen.map((r) => (r.id === id ? { ...r, ...patch } : r)), d.rechnungspositionen) : d
    );
  }, []);

  const summaries = React.useMemo(
    () => (data ? summarizeAll(data.kunden, data.positionen, data.rechnungen, data.billedLines, todayIso()) : []),
    [data]
  );

  const value = React.useMemo(
    () => ({ data, summaries, loading, error, reload, patchRechnung, notify }),
    [data, summaries, loading, error, reload, patchRechnung, notify]
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      <Toaster toasterId={toasterId} position="bottom-end" />
    </Ctx.Provider>
  );
}
