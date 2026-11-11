import * as React from 'react';
import { Field } from '@fluentui/react-components';
import { DatePicker } from '@fluentui/react-datepicker-compat';
import { CalendarStrings, DayOfWeek } from '@fluentui/react-calendar-compat';
import { formatDate, fromDate, isIsoDate, parseDate, toDate } from '../../billing/dates';

const STRINGS: CalendarStrings = {
  months: ['Jänner', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  shortMonths: ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
  days: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  shortDays: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  goToToday: 'Heute',
  prevMonthAriaLabel: 'Voriger Monat',
  nextMonthAriaLabel: 'Nächster Monat',
  prevYearAriaLabel: 'Voriges Jahr',
  nextYearAriaLabel: 'Nächstes Jahr',
  closeButtonAriaLabel: 'Schließen'
};

export interface IDateFieldProps {
  label: string;
  /** YYYY-MM-DD oder '' */
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  validationMessage?: string;
  hint?: string;
  /** ohne Field-Rahmen (z. B. in Tabellenzellen) */
  bare?: boolean;
}

/** Datumsfeld im Format TT.MM.JJJJ, Wochenbeginn Montag; Wert als YYYY-MM-DD. */
export function DateField({ label, value, onChange, required, validationMessage, hint, bare }: IDateFieldProps): React.ReactElement {
  const picker = (
    <DatePicker
      allowTextInput
      value={isIsoDate(value) ? toDate(value) : null}
      onSelectDate={(d) => onChange(d ? fromDate(d) : '')}
      formatDate={(d) => (d ? formatDate(fromDate(d)) : '')}
      parseDateFromString={(s) => {
        const iso = parseDate(s);
        return iso ? toDate(iso) : null;
      }}
      firstDayOfWeek={DayOfWeek.Monday}
      strings={STRINGS}
      placeholder="TT.MM.JJJJ"
      aria-label={bare ? label : undefined}
      // kompakt in Tabellenzellen: Platz für "TT.MM.JJJJ" plus Kalendersymbol
      style={bare ? { width: '132px', minWidth: '132px' } : undefined}
    />
  );
  if (bare) return picker;
  return (
    <Field label={label} required={required} validationMessage={validationMessage} hint={hint}>
      {picker}
    </Field>
  );
}
