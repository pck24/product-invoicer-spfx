import { SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import { AddFieldOptions } from '@pnp/sp/fields';
import { IListDef, IProvisioningPlan, LISTS, ListTitle, fieldSchemaXml, planProvisioning } from './lists';

const FIELD_OPTIONS: AddFieldOptions = AddFieldOptions.AddFieldInternalNameHint | AddFieldOptions.AddFieldToDefaultView;

/** Liest den aktuellen Stand und liefert, was fehlt. Ändert nichts. */
export async function checkProvisioning(sp: SPFI): Promise<IProvisioningPlan> {
  const titles = LISTS.map((l) => l.title);
  const filter = titles.map((t) => `Title eq '${t}'`).join(' or ');
  // Listen samt Feldnamen in einer Abfrage (läuft bei jedem Start)
  const lists: { Title: string; Fields: { InternalName: string }[] }[] = await sp.web.lists
    .filter(filter)
    .select('Title', 'Fields/InternalName')
    .expand('Fields')();
  const existing: { [title: string]: string[] | undefined } = {};
  for (const l of lists) existing[l.Title] = (l.Fields || []).map((f) => f.InternalName);
  return planProvisioning(existing);
}

/**
 * Legt fehlende Listen und Spalten an. Idempotent: bestehende Listen, Spalten
 * und Daten werden nie gelöscht oder umgebaut.
 */
export async function provision(sp: SPFI, onProgress?: (message: string) => void): Promise<void> {
  const plan = await checkProvisioning(sp);
  const report = onProgress || (() => undefined);

  for (const title of plan.createLists) {
    const def = LISTS.filter((l) => l.title === title)[0];
    report(`Liste ${title} anlegen …`);
    await sp.web.lists.add(title, def.description, 100, false, { OnQuickLaunch: false });
    await configureTitleField(sp, def);
  }

  const listId = async (title: ListTitle): Promise<string> => {
    const info: { Id: string } = await sp.web.lists.getByTitle(title).select('Id')();
    return info.Id;
  };

  for (const { list, field } of plan.createFields) {
    report(`Spalte ${list}.${field.name} anlegen …`);
    const lookupId = field.lookupList ? await listId(field.lookupList) : undefined;
    await sp.web.lists.getByTitle(list).fields.createFieldAsXml({
      SchemaXml: fieldSchemaXml(field, lookupId),
      Options: FIELD_OPTIONS
    });
  }
  report('Fertig.');
}

/** Nur für neu angelegte Listen: Anzeigename und ggf. Eindeutigkeit der Title-Spalte. */
async function configureTitleField(sp: SPFI, def: IListDef): Promise<void> {
  const props: { Title: string; Indexed?: boolean; EnforceUniqueValues?: boolean } = { Title: def.titleDisplayName };
  if (def.titleUnique) {
    props.Indexed = true;
    props.EnforceUniqueValues = true;
  }
  await sp.web.lists.getByTitle(def.title).fields.getByInternalNameOrTitle('Title').update(props);
}
