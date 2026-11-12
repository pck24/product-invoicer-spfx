import * as React from 'react';
import { Dropdown, Option } from '@fluentui/react-components';
import { yearOf } from '../../billing/dates';
import { IRechnung, neuesteZuerst } from '../../data/mapping';
import { useData } from '../DataContext';
import { RechnungenTable } from '../components/RechnungenTable';
import { useShared } from '../styles';

export interface IInvoicesProps {
  onOpenKunde: (kundeId: number) => void;
  onEditDraft: (rechnung: IRechnung) => void;
  onShow: (rechnung: IRechnung) => void;
}

/** Tab "Rechnungen": alle Rechnungen mit Jahresfilter und Aktionen. */
export function Invoices({ onOpenKunde, onEditDraft, onShow }: IInvoicesProps): React.ReactElement {
  const shared = useShared();
  const { data } = useData();
  const [jahr, setJahr] = React.useState('alle');
  const alle = React.useMemo(() => (data ? data.rechnungen.slice().sort(neuesteZuerst) : []), [data]);
  const jahre = alle
    .map((r) => (r.rechnungsdatum ? String(yearOf(r.rechnungsdatum)) : ''))
    .filter((y, i, a) => !!y && a.indexOf(y) === i);
  const rows = jahr === 'alle' ? alle : alle.filter((r) => !!r.rechnungsdatum && String(yearOf(r.rechnungsdatum)) === jahr);

  return (
    <section className={shared.card} aria-labelledby="rechnungen-title">
      <div className={shared.cardHeader}>
        <h2 id="rechnungen-title" className={shared.h2}>
          Rechnungen
        </h2>
        <Dropdown
          aria-label="Jahr"
          value={jahr === 'alle' ? 'Alle Jahre' : jahr}
          selectedOptions={[jahr]}
          onOptionSelect={(_, d) => setJahr(d.optionValue || 'alle')}
          style={{ minWidth: '140px' }}
        >
          <Option value="alle">Alle Jahre</Option>
          {jahre.map((y) => (
            <Option key={y} value={y}>
              {y}
            </Option>
          ))}
        </Dropdown>
      </div>
      <RechnungenTable rechnungen={rows} onOpenKunde={onOpenKunde} onShow={onShow} onEditDraft={onEditDraft} emptyText="Keine Rechnungen." />
    </section>
  );
}
