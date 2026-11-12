/** Schema der 4 SharePoint-Listen (rein deklarativ, ohne SharePoint-Abhängigkeit). */

export const LIST = {
  Kunden: 'AA_Kunden',
  Positionen: 'AA_Positionen',
  Rechnungen: 'AA_Rechnungen',
  Rechnungspositionen: 'AA_Rechnungspositionen'
} as const;

export type ListTitle = (typeof LIST)[keyof typeof LIST];

export type FieldType = 'Text' | 'Note' | 'Number' | 'Currency' | 'Choice' | 'Boolean' | 'DateTime' | 'Lookup' | 'URL';

export interface IFieldDef {
  /** interner Name, ohne Umlaute und Leerzeichen */
  name: string;
  displayName: string;
  type: FieldType;
  required?: boolean;
  indexed?: boolean;
  unique?: boolean;
  choices?: string[];
  defaultValue?: string;
  min?: number;
  max?: number;
  decimals?: number;
  /** Ziel-Liste bei Lookup-Feldern */
  lookupList?: ListTitle;
}

export interface IListDef {
  title: ListTitle;
  description: string;
  /** Anzeigename der Title-Spalte; wird nur beim Neuanlegen der Liste gesetzt */
  titleDisplayName: string;
  /** Title eindeutig und indiziert; nur beim Neuanlegen der Liste */
  titleUnique?: boolean;
  fields: IFieldDef[];
}

export const LISTS: IListDef[] = [
  {
    title: LIST.Kunden,
    description: 'Abo-Abrechnung: Kunden',
    titleDisplayName: 'Kundenname',
    fields: [
      { name: 'Kundennummer', displayName: 'Kundennummer', type: 'Text', required: true, indexed: true, unique: true },
      { name: 'Adresse', displayName: 'Adresse', type: 'Note' },
      { name: 'Aktiv', displayName: 'Aktiv', type: 'Boolean', defaultValue: '1' }
    ]
  },
  {
    title: LIST.Positionen,
    description: 'Abo-Abrechnung: Positionen pro Kunde',
    titleDisplayName: 'Bezeichnung',
    fields: [
      { name: 'Kunde', displayName: 'Kunde', type: 'Lookup', lookupList: LIST.Kunden, required: true, indexed: true },
      { name: 'Menge', displayName: 'Menge', type: 'Number', defaultValue: '1' },
      { name: 'Preis', displayName: 'Jahrespreis', type: 'Currency' },
      { name: 'LaufzeitMonate', displayName: 'Laufzeit (Monate)', type: 'Number', min: 1, decimals: 0, defaultValue: '12' },
      // Erfassungsdatum (nicht in der Oberfläche); bleibt für bestehende Listen, in denen die Spalte Pflicht ist
      { name: 'Beginn', displayName: 'Erfasst am', type: 'DateTime' },
      { name: 'Ende', displayName: 'Gekündigt zum', type: 'DateTime' }
    ]
  },
  {
    title: LIST.Rechnungen,
    description: 'Abo-Abrechnung: Rechnungen',
    titleDisplayName: 'Rechnungsnummer',
    titleUnique: true,
    fields: [
      { name: 'Kunde', displayName: 'Kunde', type: 'Lookup', lookupList: LIST.Kunden, indexed: true },
      { name: 'Rechnungsdatum', displayName: 'Rechnungsdatum', type: 'DateTime' },
      { name: 'Vorgaenger', displayName: 'Vorgänger', type: 'Lookup', lookupList: LIST.Rechnungen },
      { name: 'Status', displayName: 'Status', type: 'Choice', choices: ['Entwurf', 'Erstellt', 'Storniert'], defaultValue: 'Entwurf' },
      { name: 'SummeNetto', displayName: 'Summe netto', type: 'Currency' },
      // USt-Satz zum Zeitpunkt der Erstellung, damit spätere Änderungen alte Rechnungen nicht verändern
      { name: 'UstSatz', displayName: 'USt-Satz (%)', type: 'Number', decimals: 2 },
      { name: 'PdfLink', displayName: 'PDF', type: 'URL' }
    ]
  },
  {
    title: LIST.Rechnungspositionen,
    description: 'Abo-Abrechnung: Rechnungspositionen (verrechnete Zeiträume)',
    titleDisplayName: 'Bezeichnung',
    fields: [
      { name: 'Rechnung', displayName: 'Rechnung', type: 'Lookup', lookupList: LIST.Rechnungen, indexed: true },
      { name: 'Position', displayName: 'Position', type: 'Lookup', lookupList: LIST.Positionen, indexed: true },
      { name: 'Von', displayName: 'Von', type: 'DateTime' },
      { name: 'Bis', displayName: 'Bis', type: 'DateTime' },
      { name: 'Monate', displayName: 'Monate', type: 'Number', decimals: 2 },
      { name: 'Menge', displayName: 'Menge', type: 'Number' },
      { name: 'Jahrespreis', displayName: '12-Monatspreis', type: 'Currency' },
      { name: 'Betrag', displayName: 'Betrag', type: 'Currency' },
      { name: 'Art', displayName: 'Art', type: 'Choice', choices: ['Folgezeitraum', 'Anteilig', 'Nachverrechnung', 'Einmalig'] }
    ]
  }
];

/**
 * Frühere Cent-Spalten (Ganzzahl). Bei der Einrichtung werden ihre Werte in die
 * Euro-Spalten übernommen und die alten Spalten danach gelöscht.
 */
export interface ICentMigration {
  list: ListTitle;
  /** alte Spalte in Cent */
  from: string;
  /** neue Spalte in Euro */
  to: string;
}

export const CENT_MIGRATIONS: ICentMigration[] = [
  { list: LIST.Rechnungen, from: 'SummeNettoCent', to: 'SummeNetto' },
  { list: LIST.Rechnungspositionen, from: 'EinzelpreisCent', to: 'Jahrespreis' },
  { list: LIST.Rechnungspositionen, from: 'BetragCent', to: 'Betrag' }
];

/** Text für XML-Attribute und -Inhalte (Feldschema, Word-Dokument). */
export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const esc = escapeXml;

/** CAML-Feldschema für createFieldAsXml. lookupListId ist bei Lookup-Feldern Pflicht. */
export function fieldSchemaXml(f: IFieldDef, lookupListId?: string): string {
  const attrs: string[] = [
    `Type="${f.type}"`,
    `Name="${f.name}"`,
    `StaticName="${f.name}"`,
    `DisplayName="${esc(f.displayName)}"`,
    `Required="${f.required ? 'TRUE' : 'FALSE'}"`
  ];
  if (f.indexed || f.unique) attrs.push('Indexed="TRUE"');
  if (f.unique) attrs.push('EnforceUniqueValues="TRUE"');
  if (f.min !== undefined) attrs.push(`Min="${f.min}"`);
  if (f.max !== undefined) attrs.push(`Max="${f.max}"`);
  if (f.decimals !== undefined) attrs.push(`Decimals="${f.decimals}"`);
  let inner = '';
  switch (f.type) {
    case 'Note':
      attrs.push('NumLines="4"', 'RichText="FALSE"');
      break;
    case 'Currency':
      attrs.push('LCID="3079"', 'Decimals="2"');
      break;
    case 'DateTime':
      attrs.push('Format="DateOnly"');
      break;
    case 'URL':
      attrs.push('Format="Hyperlink"');
      break;
    case 'Lookup':
      if (!lookupListId) throw new Error(`Lookup-Liste für ${f.name} fehlt`);
      attrs.push(`List="{${lookupListId.replace(/[{}]/g, '')}}"`, 'ShowField="Title"');
      break;
    case 'Choice':
      attrs.push('Format="Dropdown"', 'FillInChoice="FALSE"');
      inner += `<CHOICES>${(f.choices || []).map((c) => `<CHOICE>${esc(c)}</CHOICE>`).join('')}</CHOICES>`;
      break;
  }
  if (f.defaultValue !== undefined) inner += `<Default>${esc(f.defaultValue)}</Default>`;
  return `<Field ${attrs.join(' ')}>${inner}</Field>`;
}

export interface IProvisioningPlan {
  /** Listen, die neu angelegt werden müssen (in Abhängigkeitsreihenfolge) */
  createLists: ListTitle[];
  /** fehlende Felder je Liste (auch für neu anzulegende Listen) */
  createFields: { list: ListTitle; field: IFieldDef }[];
  /** alte Cent-Spalten, deren Werte in Euro-Spalten übernommen werden */
  migrations: ICentMigration[];
}

/**
 * Ermittelt, was fehlt. existing: interne Feldnamen je vorhandener Liste;
 * fehlt der Eintrag, existiert die Liste nicht.
 */
export function planProvisioning(existing: { [title: string]: string[] | undefined }): IProvisioningPlan {
  const plan: IProvisioningPlan = { createLists: [], createFields: [], migrations: [] };
  for (const def of LISTS) {
    const fields = existing[def.title];
    if (!fields) plan.createLists.push(def.title);
    for (const f of def.fields) {
      if (!fields || fields.indexOf(f.name) < 0) plan.createFields.push({ list: def.title, field: f });
    }
  }
  // solange eine alte Cent-Spalte existiert, ist die Übernahme offen (wird erst nach Erfolg gelöscht)
  plan.migrations = CENT_MIGRATIONS.filter((m) => {
    const fields = existing[m.list];
    return !!fields && fields.indexOf(m.from) >= 0;
  });
  return plan;
}

export function isComplete(plan: IProvisioningPlan): boolean {
  return plan.createLists.length === 0 && plan.createFields.length === 0 && plan.migrations.length === 0;
}
