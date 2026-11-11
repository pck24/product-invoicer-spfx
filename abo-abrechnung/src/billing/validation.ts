import { addDaysIso, formatDate, isIsoDate } from './dates';
import { isActiveLine, nextStart } from './proposal';
import { IBilledLine, IPosition, ISODate } from './types';

export interface IDraftLine {
  key: string;
  positionId: number | null;
  title: string;
  von: ISODate | null;
  bis: ISODate | null;
}

export interface IValidationIssue {
  severity: 'error' | 'warning';
  lineKey?: string;
  message: string;
}

export interface IValidationInput {
  invoiceNumber: string;
  /** alle bestehenden Rechnungsnummern, ohne die gerade bearbeitete Rechnung */
  existingInvoiceNumbers: string[];
  lines: IDraftLine[];
  positions: IPosition[];
  /** frisch gelesene Rechnungspositionen, ohne die der gerade bearbeiteten Rechnung */
  billedLines: IBilledLine[];
}

export function normalizeNumber(n: string): string {
  return n.trim().toUpperCase();
}

export function validateInvoice(input: IValidationInput): IValidationIssue[] {
  const issues: IValidationIssue[] = [];
  const nr = normalizeNumber(input.invoiceNumber);
  if (!nr) {
    issues.push({ severity: 'error', message: 'Rechnungsnummer fehlt.' });
  } else if (input.existingInvoiceNumbers.some((x) => normalizeNumber(x) === nr)) {
    issues.push({ severity: 'error', message: `Die Rechnungsnummer ${input.invoiceNumber.trim()} existiert bereits.` });
  }

  const byPosition: { [id: number]: IDraftLine[] } = {};
  for (const line of input.lines) {
    const name = line.title || 'Position';
    if ((line.von && !isIsoDate(line.von)) || (line.bis && !isIsoDate(line.bis))) {
      issues.push({ severity: 'error', lineKey: line.key, message: `${name}: ungültiges Datum.` });
      continue;
    }
    if (line.von && line.bis && line.bis < line.von) {
      issues.push({ severity: 'error', lineKey: line.key, message: `${name}: „Bis“ liegt vor „Von“.` });
      continue;
    }
    if (line.positionId === null) continue;
    if (!line.von || !line.bis) {
      issues.push({ severity: 'error', lineKey: line.key, message: `${name}: Zeitraum fehlt.` });
      continue;
    }
    (byPosition[line.positionId] = byPosition[line.positionId] || []).push(line);
  }

  for (const position of input.positions) {
    const drafts = byPosition[position.id];
    if (!drafts) continue;
    const existing = input.billedLines.filter((l) => l.positionId === position.id && isActiveLine(l));
    // Erste Verrechnung: Zeitraum frei wählbar ab Vertragsbeginn, daher keine Lücken-Warnung
    let first = existing.length === 0;
    let expected = nextStart(position, input.billedLines);
    const sorted = drafts.slice().sort((a, b) => (a.von as string).localeCompare(b.von as string));
    let prev: IDraftLine | null = null;
    for (const line of sorted) {
      const von = line.von as ISODate;
      const bis = line.bis as ISODate;
      const name = position.title;
      const overlap = existing.filter((l) => l.von && l.bis && !(bis < l.von || von > l.bis));
      for (const o of overlap) {
        issues.push({
          severity: 'error',
          lineKey: line.key,
          message: `${name}: überschneidet sich mit ${o.rechnungsnummer || 'einer bestehenden Rechnung'} (${formatDate(o.von)} – ${formatDate(o.bis)}).`
        });
      }
      if (prev && von <= (prev.bis as ISODate)) {
        issues.push({ severity: 'error', lineKey: line.key, message: `${name}: Zeiträume in dieser Rechnung überschneiden sich.` });
      } else if (von < expected && overlap.length === 0) {
        const text = first ? `vor dem Vertragsbeginn ${formatDate(expected)}` : `vor dem nächsten offenen Tag ${formatDate(expected)}`;
        issues.push({ severity: 'error', lineKey: line.key, message: `${name}: „Von“ liegt ${text}.` });
      } else if (von > expected && !first) {
        issues.push({ severity: 'warning', lineKey: line.key, message: `${name}: Lücke von ${formatDate(expected)} bis ${formatDate(addDaysIso(von, -1))}.` });
      }
      if (position.ende && bis > position.ende) {
        issues.push({ severity: 'error', lineKey: line.key, message: `${name}: „Bis“ liegt nach dem Leistungsende ${formatDate(position.ende)}.` });
      }
      expected = addDaysIso(bis, 1);
      first = false;
      prev = line;
    }
  }
  return issues;
}

export function hasErrors(issues: IValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
