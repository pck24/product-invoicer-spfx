import * as React from 'react';
import { Button, MessageBar, MessageBarBody, MessageBarTitle, Spinner, Text, makeStyles, tokens } from '@fluentui/react-components';
import { IProvisioningPlan } from '../../data/lists';
import { provision } from '../../data/provisioning';
import { useApp } from '../AppContext';

const useStyles = makeStyles({
  card: {
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: '8px',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  list: { margin: 0, paddingLeft: '20px', color: tokens.colorNeutralForeground3 }
});

export interface ISetupProps {
  plan: IProvisioningPlan;
  onDone: () => void;
}

export function Setup({ plan, onDone }: ISetupProps): React.ReactElement {
  const { sp } = useApp();
  const styles = useStyles();
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  const run = async (): Promise<void> => {
    setBusy(true);
    setError(undefined);
    try {
      await provision(sp, setProgress);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const fieldsByList: { [list: string]: string[] } = {};
  for (const f of plan.createFields) (fieldsByList[f.list] = fieldsByList[f.list] || []).push(f.field.name);

  return (
    <section className={styles.card} aria-labelledby="setup-title">
      <Text as="h1" id="setup-title" size={600} weight="semibold">
        Listen einrichten
      </Text>
      <Text>
        Für die Abo-Abrechnung fehlen in dieser Site Listen oder Spalten. Sie werden angelegt; bestehende Listen, Spalten und Daten
        bleiben unverändert.
      </Text>
      <ul className={styles.list}>
        {Object.keys(fieldsByList).map((list) => (
          <li key={list}>
            {plan.createLists.indexOf(list as never) >= 0 ? `${list} (neu)` : list}: {fieldsByList[list].join(', ')}
          </li>
        ))}
      </ul>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>
            <MessageBarTitle>Einrichtung fehlgeschlagen</MessageBarTitle>
            {error}
          </MessageBarBody>
        </MessageBar>
      )}
      <div>
        {busy ? (
          <Spinner size="tiny" label={progress || 'Wird eingerichtet …'} />
        ) : (
          <Button appearance="primary" onClick={run}>
            Listen einrichten
          </Button>
        )}
      </div>
    </section>
  );
}
