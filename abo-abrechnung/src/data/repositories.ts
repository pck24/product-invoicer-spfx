import { SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import { IList } from '@pnp/sp/lists';
import { todayIso } from '../billing/dates';
import { RechnungsStatus } from '../billing/types';
import { LIST } from './lists';
import {
  IKunde,
  IPositionItem,
  IRechnung,
  IRechnungsposition,
  KUNDE_FIELDS,
  POSITION_FIELDS,
  RECHNUNG_FIELDS,
  RECHNUNGSPOSITION_FIELDS,
  SPItem,
  kundeFromItem,
  kundeToItem,
  positionFromItem,
  positionToItem,
  rechnungFromItem,
  rechnungToItem,
  rechnungspositionFromItem,
  rechnungspositionToItem,
  toSpDate
} from './mapping';

const PAGE_SIZE = 2000;

/**
 * Liest alle Elemente seitenweise über die (immer indizierte) Id, damit auch
 * Listen über der 5.000er-Schwelle vollständig gelesen werden.
 */
export async function readAll(list: IList, fields: string[], filter?: string): Promise<SPItem[]> {
  const select = fields.indexOf('Id') >= 0 ? fields : fields.concat('Id');
  const result: SPItem[] = [];
  let lastId = 0;
  for (;;) {
    const f = `Id gt ${lastId}${filter ? ` and (${filter})` : ''}`;
    const page: SPItem[] = await list.items.select(...select).filter(f).orderBy('Id', true).top(PAGE_SIZE)();
    result.push(...page);
    if (page.length < PAGE_SIZE) return result;
    lastId = page[page.length - 1].Id;
  }
}

/** Löscht Elemente; Fehler einzelner Elemente werden optional ignoriert (Aufräumen). */
async function deleteItems(list: IList, ids: number[], ignoreErrors = false): Promise<void> {
  await Promise.all(
    ids.map((id) =>
      list.items
        .getById(id)
        .delete()
        .catch((e) => {
          if (!ignoreErrors) throw e;
        })
    )
  );
}

export class Repository {
  public constructor(private readonly sp: SPFI) {}

  private list(title: string): IList {
    return this.sp.web.lists.getByTitle(title);
  }

  // ---------- Kunden ----------

  public async getKunden(): Promise<IKunde[]> {
    return (await readAll(this.list(LIST.Kunden), KUNDE_FIELDS)).map(kundeFromItem);
  }

  public async saveKunde(kunde: Omit<IKunde, 'id'>, id?: number): Promise<IKunde> {
    const item = kundeToItem(kunde);
    if (id) {
      await this.list(LIST.Kunden).items.getById(id).update(item);
      return { ...kunde, id };
    }
    const added: SPItem = await this.list(LIST.Kunden).items.add(item);
    return { ...kunde, id: added.Id };
  }

  // ---------- Positionen ----------

  public async getPositionen(): Promise<IPositionItem[]> {
    return (await readAll(this.list(LIST.Positionen), POSITION_FIELDS)).map(positionFromItem);
  }

  public async savePosition(position: Omit<IPositionItem, 'id'>, id?: number): Promise<IPositionItem> {
    const item = positionToItem(position);
    if (id) {
      await this.list(LIST.Positionen).items.getById(id).update(item);
      return { ...position, id };
    }
    // "Beginn" ist in früher angelegten Listen eine Pflichtspalte → Erfassungsdatum eintragen
    const added: SPItem = await this.list(LIST.Positionen).items.add({ ...item, Beginn: toSpDate(todayIso()) });
    return { ...position, id: added.Id };
  }

  /** Löscht eine Position nur, solange sie nie verrechnet wurde (auch nicht storniert). */
  public async deletePosition(id: number): Promise<void> {
    const lines = await readAll(this.list(LIST.Rechnungspositionen), ['Id'], `PositionId eq ${id}`);
    if (lines.length > 0) throw new Error('Die Position wurde bereits verrechnet und kann nicht gelöscht werden.');
    await this.list(LIST.Positionen).items.getById(id).delete();
  }

  // ---------- Rechnungen ----------

  public async getRechnungen(): Promise<IRechnung[]> {
    return (await readAll(this.list(LIST.Rechnungen), RECHNUNG_FIELDS)).map(rechnungFromItem);
  }

  /** Alle Rechnungspositionen oder nur die der angegebenen Positionen. */
  public async getRechnungspositionen(positionIds?: number[]): Promise<IRechnungsposition[]> {
    if (positionIds && positionIds.length === 0) return [];
    const f = positionIds ? positionIds.map((id) => `PositionId eq ${id}`).join(' or ') : undefined;
    return (await readAll(this.list(LIST.Rechnungspositionen), RECHNUNGSPOSITION_FIELDS, f)).map(rechnungspositionFromItem);
  }

  /** Legt Rechnungspositionen parallel an; schlägt eine fehl, werden die angelegten wieder entfernt. */
  private async addLines(rechnungId: number, lines: Omit<IRechnungsposition, 'id' | 'rechnungId'>[]): Promise<number[]> {
    const list = this.list(LIST.Rechnungspositionen);
    const results = await Promise.all(
      lines.map((line) =>
        list.items.add(rechnungspositionToItem({ ...line, rechnungId })).then(
          (added: SPItem) => ({ id: added.Id as number, error: undefined as unknown }),
          (error: unknown) => ({ id: 0, error })
        )
      )
    );
    const failed = results.filter((r) => r.error !== undefined)[0];
    const ids = results.filter((r) => r.error === undefined).map((r) => r.id);
    if (failed) {
      await deleteItems(list, ids, true);
      throw failed.error;
    }
    return ids;
  }

  /**
   * Speichert zuerst die Rechnung, dann die Positionen. Schlägt etwas fehl,
   * werden die bereits angelegten Positionen und die Rechnung wieder entfernt.
   */
  public async createRechnung(
    rechnung: Omit<IRechnung, 'id' | 'pdfUrl'>,
    lines: Omit<IRechnungsposition, 'id' | 'rechnungId'>[]
  ): Promise<IRechnung> {
    const added: SPItem = await this.list(LIST.Rechnungen).items.add(rechnungToItem(rechnung));
    const rechnungId: number = added.Id;
    try {
      await this.addLines(rechnungId, lines);
    } catch (e) {
      await deleteItems(this.list(LIST.Rechnungen), [rechnungId], true);
      throw e;
    }
    return { ...rechnung, id: rechnungId, pdfUrl: null };
  }

  /**
   * Überschreibt einen Entwurf. Erst werden die neuen Positionen angelegt (mit Rollback),
   * dann die alten gelöscht, zuletzt Kopf und Status gesetzt – so geht bei einem Fehler
   * der bisherige Inhalt nicht verloren.
   */
  public async updateEntwurf(
    id: number,
    rechnung: Omit<IRechnung, 'id' | 'pdfUrl'>,
    lines: Omit<IRechnungsposition, 'id' | 'rechnungId'>[]
  ): Promise<IRechnung> {
    const item: SPItem = await this.list(LIST.Rechnungen).items.getById(id).select('Status')();
    if (item.Status !== 'Entwurf') throw new Error('Nur Entwürfe können bearbeitet werden.');
    const old = await readAll(this.list(LIST.Rechnungspositionen), ['Id'], `RechnungId eq ${id}`);
    await this.addLines(id, lines);
    await deleteItems(
      this.list(LIST.Rechnungspositionen),
      old.map((l) => l.Id as number)
    );
    await this.list(LIST.Rechnungen).items.getById(id).update(rechnungToItem(rechnung));
    return { ...rechnung, id, pdfUrl: null };
  }

  /** Storniert eine erstellte Rechnung; ihre Zeiträume sind danach wieder frei. */
  public async stornieren(id: number): Promise<void> {
    const status: RechnungsStatus = 'Storniert';
    await this.list(LIST.Rechnungen).items.getById(id).update({ Status: status });
  }

  /** Löscht einen Entwurf samt Positionen. Andere Status werden abgelehnt. */
  public async deleteEntwurf(id: number): Promise<void> {
    const item: SPItem = await this.list(LIST.Rechnungen).items.getById(id).select('Status')();
    if (item.Status !== 'Entwurf') throw new Error('Nur Entwürfe dürfen gelöscht werden.');
    const lines = await readAll(this.list(LIST.Rechnungspositionen), ['Id'], `RechnungId eq ${id}`);
    await deleteItems(
      this.list(LIST.Rechnungspositionen),
      lines.map((l) => l.Id as number)
    );
    await this.list(LIST.Rechnungen).items.getById(id).delete();
  }

  public async setPdfLink(id: number, url: string, description: string): Promise<void> {
    await this.list(LIST.Rechnungen).items.getById(id).update({ PdfLink: { Url: url, Description: description } });
  }
}
