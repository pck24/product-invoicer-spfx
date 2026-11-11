import * as React from 'react';
import {
  Breadcrumb,
  BreadcrumbButton,
  BreadcrumbDivider,
  BreadcrumbItem,
  FluentProvider,
  MessageBar,
  MessageBarBody,
  Skeleton,
  SkeletonItem,
  Theme,
  makeStyles,
  tokens,
  webLightTheme
} from '@fluentui/react-components';
import { IProvisioningPlan, isComplete } from '../data/lists';
import { checkProvisioning } from '../data/provisioning';
import { AppContext, IAppServices, useApp } from './AppContext';
import { DataProvider, errorText, useData } from './DataContext';
import { CustomerDetail } from './screens/CustomerDetail';
import { CustomerList, HomeTab } from './screens/CustomerList';
import { InvoiceWizard } from './screens/InvoiceWizard';
import { Invoices } from './screens/Invoices';
import { IRechnung } from '../data/mapping';
import { Setup } from './screens/Setup';

const useStyles = makeStyles({
  root: {
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
    padding: '24px 16px',
    minHeight: '200px',
    '@media (max-width: 640px)': { padding: '16px 8px' }
  },
  inner: {
    maxWidth: '1240px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    fontVariantNumeric: 'tabular-nums'
  },
  skeleton: { display: 'flex', flexDirection: 'column', gap: '16px' }
});

export type Route = { name: 'home'; tab: HomeTab } | { name: 'kunde'; kundeId: number } | { name: 'rechnung'; kundeId: number; rechnungId?: number };

function LoadingSkeleton(): React.ReactElement {
  const s = useStyles();
  return (
    <Skeleton aria-label="Wird geladen" className={s.skeleton}>
      <SkeletonItem size={72} />
      <SkeletonItem size={56} />
      <SkeletonItem size={128} />
    </Skeleton>
  );
}

function Screens(): React.ReactElement {
  const { data, loading, error } = useData();
  const [route, setRoute] = React.useState<Route>({ name: 'home', tab: 'kunden' });

  if (error) {
    return (
      <MessageBar intent="error">
        <MessageBarBody>Daten konnten nicht geladen werden: {error}</MessageBarBody>
      </MessageBar>
    );
  }
  if (!data) return loading ? <LoadingSkeleton /> : <></>;

  const kunde = route.name !== 'home' ? data.kunden.filter((k) => k.id === route.kundeId)[0] : undefined;
  const home = (): void => setRoute({ name: 'home', tab: 'kunden' });
  const editDraft = (r: IRechnung): void => {
    if (r.kundeId) setRoute({ name: 'rechnung', kundeId: r.kundeId, rechnungId: r.id });
  };

  return (
    <>
      {route.name !== 'home' && (
        <Breadcrumb aria-label="Pfad">
          <BreadcrumbItem>
            <BreadcrumbButton onClick={home}>Kunden</BreadcrumbButton>
          </BreadcrumbItem>
          <BreadcrumbDivider />
          <BreadcrumbItem>
            {route.name === 'kunde' ? (
              <BreadcrumbButton current>{kunde ? kunde.name : ''}</BreadcrumbButton>
            ) : (
              <BreadcrumbButton onClick={() => setRoute({ name: 'kunde', kundeId: route.kundeId })}>{kunde ? kunde.name : ''}</BreadcrumbButton>
            )}
          </BreadcrumbItem>
          {route.name === 'rechnung' && (
            <>
              <BreadcrumbDivider />
              <BreadcrumbItem>
                <BreadcrumbButton current>{route.rechnungId ? 'Entwurf' : 'Rechnung'}</BreadcrumbButton>
              </BreadcrumbItem>
            </>
          )}
        </Breadcrumb>
      )}
      {route.name === 'home' && (
        <CustomerList
          tab={route.tab}
          onTab={(tab) => setRoute({ name: 'home', tab })}
          onOpen={(kundeId) => setRoute({ name: 'kunde', kundeId })}
          rechnungen={<Invoices onOpenKunde={(kundeId) => setRoute({ name: 'kunde', kundeId })} onEditDraft={editDraft} />}
        />
      )}
      {route.name === 'kunde' && (
        <CustomerDetail kundeId={route.kundeId} onFolgerechnung={() => setRoute({ name: 'rechnung', kundeId: route.kundeId })} onEditDraft={editDraft} />
      )}
      {route.name === 'rechnung' && (
        <InvoiceWizard
          key={`${route.kundeId}-${route.rechnungId || 'neu'}`}
          kundeId={route.kundeId}
          rechnungId={route.rechnungId}
          onDone={() => setRoute({ name: 'kunde', kundeId: route.kundeId })}
          onCancel={() => setRoute({ name: 'kunde', kundeId: route.kundeId })}
        />
      )}
    </>
  );
}

type SetupState = { kind: 'checking' } | { kind: 'setup'; plan: IProvisioningPlan } | { kind: 'ready' } | { kind: 'error'; message: string };

function Main(): React.ReactElement {
  const { sp } = useApp();
  const [state, setState] = React.useState<SetupState>({ kind: 'checking' });

  const check = React.useCallback(async () => {
    setState({ kind: 'checking' });
    try {
      const plan = await checkProvisioning(sp);
      setState(isComplete(plan) ? { kind: 'ready' } : { kind: 'setup', plan });
    } catch (e) {
      setState({ kind: 'error', message: errorText(e) });
    }
  }, [sp]);

  React.useEffect(() => {
    check().catch(() => undefined);
  }, [check]);

  switch (state.kind) {
    case 'checking':
      return <LoadingSkeleton />;
    case 'error':
      return (
        <MessageBar intent="error">
          <MessageBarBody>{state.message}</MessageBarBody>
        </MessageBar>
      );
    case 'setup':
      return <Setup plan={state.plan} onDone={check} />;
    default:
      return (
        <DataProvider>
          <Screens />
        </DataProvider>
      );
  }
}

export interface IAppProps {
  services: IAppServices;
  theme?: Theme;
}

export function App({ services, theme }: IAppProps): React.ReactElement {
  const styles = useStyles();
  return (
    <AppContext.Provider value={services}>
      <FluentProvider theme={theme || webLightTheme}>
        <div className={styles.root}>
          <div className={styles.inner}>
            <Main />
          </div>
        </div>
      </FluentProvider>
    </AppContext.Provider>
  );
}
