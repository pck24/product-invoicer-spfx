import * as React from 'react';
import { FluentProvider, MessageBar, MessageBarBody, Skeleton, SkeletonItem, Text, Theme, makeStyles, tokens, webLightTheme } from '@fluentui/react-components';
import { IProvisioningPlan, isComplete } from '../data/lists';
import { checkProvisioning } from '../data/provisioning';
import { AppContext, IAppServices, useApp } from './AppContext';
import { Setup } from './screens/Setup';

const useStyles = makeStyles({
  root: {
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
    padding: '24px 16px',
    minHeight: '200px'
  },
  inner: {
    maxWidth: '1240px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    fontVariantNumeric: 'tabular-nums'
  }
});

type State = { kind: 'checking' } | { kind: 'setup'; plan: IProvisioningPlan } | { kind: 'ready' } | { kind: 'error'; message: string };

function Main(): React.ReactElement {
  const { sp } = useApp();
  const [state, setState] = React.useState<State>({ kind: 'checking' });

  const check = React.useCallback(async () => {
    setState({ kind: 'checking' });
    try {
      const plan = await checkProvisioning(sp);
      setState(isComplete(plan) ? { kind: 'ready' } : { kind: 'setup', plan });
    } catch (e) {
      setState({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, [sp]);

  React.useEffect(() => {
    check().catch(() => undefined);
  }, [check]);

  switch (state.kind) {
    case 'checking':
      return (
        <Skeleton aria-label="Wird geladen">
          <SkeletonItem size={48} />
        </Skeleton>
      );
    case 'error':
      return (
        <MessageBar intent="error">
          <MessageBarBody>{state.message}</MessageBarBody>
        </MessageBar>
      );
    case 'setup':
      return <Setup plan={state.plan} onDone={check} />;
    default:
      return <Text>Listen sind eingerichtet.</Text>;
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
