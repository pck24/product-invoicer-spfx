import { LISTS, fieldSchemaXml, isComplete, planProvisioning } from '../lists';
import { fromSpDate, positionFromItem, positionToItem, toBilledLines, toSpDate } from '../mapping';

describe('Provisionierungsplan', () => {
  it('leere Site: alle 4 Listen mit allen Spalten', () => {
    const plan = planProvisioning({});
    expect(plan.createLists).toEqual(['AA_Kunden', 'AA_Positionen', 'AA_Rechnungen', 'AA_Rechnungspositionen']);
    expect(plan.createFields).toHaveLength(LISTS.reduce((n, l) => n + l.fields.length, 0));
  });

  it('vollständige Site: zweiter Lauf ändert nichts', () => {
    const existing: { [t: string]: string[] } = {};
    for (const l of LISTS) existing[l.title] = ['Title', 'ID'].concat(l.fields.map((f) => f.name));
    expect(isComplete(planProvisioning(existing))).toBe(true);
  });

  it('fehlende Spalte in bestehender Liste wird ergänzt, Liste nicht neu angelegt', () => {
    const existing: { [t: string]: string[] } = {};
    for (const l of LISTS) existing[l.title] = l.fields.map((f) => f.name);
    existing.AA_Rechnungen = existing.AA_Rechnungen.filter((n) => n !== 'PdfLink');
    const plan = planProvisioning(existing);
    expect(plan.createLists).toEqual([]);
    expect(plan.createFields.map((f) => `${f.list}.${f.field.name}`)).toEqual(['AA_Rechnungen.PdfLink']);
  });

  it('Lookup-Ziele werden vor ihrer Verwendung angelegt', () => {
    const order = LISTS.map((l) => l.title);
    for (const l of LISTS) {
      for (const f of l.fields) {
        if (f.lookupList) expect(order.indexOf(f.lookupList)).toBeLessThanOrEqual(order.indexOf(l.title));
      }
    }
  });

  it('Feldschema', () => {
    const kunden = LISTS[0];
    const nr = kunden.fields.filter((f) => f.name === 'Kundennummer')[0];
    expect(fieldSchemaXml(nr)).toBe(
      '<Field Type="Text" Name="Kundennummer" StaticName="Kundennummer" DisplayName="Kundennummer" Required="TRUE" Indexed="TRUE" EnforceUniqueValues="TRUE"></Field>'
    );
    const kunde = LISTS[1].fields.filter((f) => f.name === 'Kunde')[0];
    expect(fieldSchemaXml(kunde, 'ABC')).toContain('List="{ABC}" ShowField="Title"');
    expect(() => fieldSchemaXml(kunde)).toThrow();
    const art = LISTS[3].fields.filter((f) => f.name === 'Art')[0];
    expect(LISTS[1].fields.map((f) => f.name)).toEqual(['Kunde', 'Menge', 'Preis', 'LaufzeitMonate', 'Beginn', 'Ende']);
    expect(fieldSchemaXml(art)).toContain('<CHOICE>Folgezeitraum</CHOICE><CHOICE>Anteilig</CHOICE>');
    const beginn = LISTS[1].fields.filter((f) => f.name === 'Beginn')[0];
    expect(fieldSchemaXml(beginn)).toContain('Format="DateOnly"');
  });

  it('keine Umlaute oder Leerzeichen in internen Namen', () => {
    for (const l of LISTS) for (const f of l.fields) expect(f.name).toMatch(/^[A-Za-z]+$/);
  });
});

describe('Datumsfelder', () => {
  it('schreibt 12:00 UTC', () => {
    expect(toSpDate('2027-01-01')).toBe('2027-01-01T12:00:00Z');
    expect(toSpDate(null)).toBeNull();
  });

  it('liest Mitternacht der Site-Zeitzone als Kalendertag', () => {
    expect(fromSpDate('2026-12-31T23:00:00Z')).toBe('2027-01-01'); // Wien, Winterzeit
    expect(fromSpDate('2027-06-30T22:00:00Z')).toBe('2027-07-01'); // Wien, Sommerzeit
    expect(fromSpDate('2027-01-01T00:00:00Z')).toBe('2027-01-01'); // UTC
    expect(fromSpDate('2027-01-01T05:00:00Z')).toBe('2027-01-01'); // UTC−5
    expect(fromSpDate('2027-01-01T11:00:00Z')).toBe('2027-01-01'); // UTC−11
    expect(fromSpDate('2026-12-31T13:00:00Z')).toBe('2027-01-01'); // UTC+11
    expect(fromSpDate(null)).toBeNull();
  });
});

describe('Mapping', () => {
  it('Position hin und zurück, Jahrespreis in Cent', () => {
    const item = positionToItem({ kundeId: 3, title: 'Cloud-Backup', menge: 1, jahrespreisCent: 11880, laufzeitMonate: 12, beginn: '2026-08-01', ende: null });
    expect(item.Preis).toBe(118.8);
    const back = positionFromItem({ ...item, Id: 7, Beginn: '2026-07-31T22:00:00Z' });
    expect(back).toMatchObject({ id: 7, kundeId: 3, jahrespreisCent: 11880, laufzeitMonate: 12, beginn: '2026-08-01', ende: null });
  });

  it('verknüpft Rechnungspositionen mit dem Rechnungsstatus', () => {
    const lines = toBilledLines(
      [{ id: 1, rechnungId: 10, positionId: 5, title: 'x', von: '2027-01-01', bis: '2027-12-31', monateX100: 1200, menge: 1, einzelpreisCent: 100, betragCent: 1200, art: 'Folgezeitraum' }],
      [{ id: 10, nummer: 'RE-2027-001', kundeId: 1, rechnungsdatum: null, vorgaengerId: null, status: 'Storniert', summeNettoCent: 0, pdfUrl: null }]
    );
    expect(lines).toEqual([{ positionId: 5, von: '2027-01-01', bis: '2027-12-31', status: 'Storniert', rechnungId: 10, rechnungsnummer: 'RE-2027-001', betragCent: 1200 }]);
  });
});
