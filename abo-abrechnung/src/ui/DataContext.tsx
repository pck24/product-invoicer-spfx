import * as React from 'react';
import { Link, Toast, ToastBody, ToastTitle, Toaster, useId, useToastController } from '@fluentui/react-components';
import { IBilledLine } from '../billing/types';
import { IKunde, IPositionItem, IRechnung, IRechnungsposition, toBilledLines } from '../data/mapping';
import { useApp } from './AppContext';

export interface IAppData {
  kunden: IKunde[];
  positionen: IPositionItem[];
  rechnungen: IRechnung[];
  rechnungspositionen: IRechnungsposition[];
  billedLines: IBilledLine[];
}

export interface IDataContext {
  data: IAppData | undefined;
  loading: boolean;
  error: string | undefined;
  /** lädt neu und liefert die frischen Daten */
  reload: () => Promise<IAppData | undefined>;
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
      const fresh = { kunden, positionen, rechnungen, rechnungspositionen, billedLines: toBilledLines(rechnungspositionen, rechnungen) };
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

  const value = React.useMemo(() => ({ data, loading, error, reload, notify }), [data, loading, error, reload, notify]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <Toaster toasterId={toasterId} position="bottom-end" />
    </Ctx.Provider>
  );
}
