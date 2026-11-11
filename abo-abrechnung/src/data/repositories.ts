import { SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import { IList } from '@pnp/sp/lists';
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
  rechnungspositionToItem
} from './mapping';

/** Obergrenze je Abfrage; für eine Einzelunternehmer-Abrechnung reichlich. */
const MAX_ITEMS = 5000;

async function readAll(list: IList, fields: string[], filter?: string): Promise<SPItem[]> {
  let query = list.items.select(...fields).top(MAX_ITEMS);
  if (filter) query = query.filter(filter);
  return query();
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

  public async getPositionen(kundeId?: number): Promise<IPositionItem[]> {
    const filter = kundeId ? `KundeId eq ${kundeId}` : undefined;
    return (await readAll(this.list(LIST.Positionen), POSITION_FIELDS, filter)).map(positionFromItem);
  }

  public async savePosition(position: Omit<IPositionItem, 'id'>, id?: number): Promise<IPositionItem> {
    const item = positionToItem(position);
    if (id) {
      await this.list(LIST.Positionen).items.getById(id).update(item);
      return { ...position, id };
    }
    const added: SPItem = await this.list(LIST.Positionen).items.add(item);
    return { ...position, id: added.Id };
  }

  /** Löscht eine Position nur, solange sie nie verrechnet wurde (auch nicht storniert). */
  public async deletePosition(id: number): Promise<void> {
    const lines = await readAll(this.list(LIST.Rechnungspositionen), ['Id'], `PositionId eq ${id}`);
    if (lines.length > 0) throw new Error('Die Position wurde bereits verrechnet und kann nicht gelöscht werden.');
    await this.list(LIST.Positionen).items.getById(id).delete();
  }

  // ---------- Rechnungen ----------

  public async getRechnungen(kundeId?: number): Promise<IRechnung[]> {
    const filter = kundeId ? `KundeId eq ${kundeId}` : undefined;
    return (await readAll(this.list(LIST.Rechnungen), RECHNUNG_FIELDS, filter)).map(rechnungFromItem);
  }

  public async getRechnungspositionen(filter?: { rechnungId?: number; positionIds?: number[] }): Promise<IRechnungsposition[]> {
    let f: string | undefined;
    if (filter && filter.rechnungId) f = `RechnungId eq ${filter.rechnungId}`;
    else if (filter && filter.positionIds) {
      if (filter.positionIds.length === 0) return [];
      f = filter.positionIds.map((id) => `PositionId eq ${id}`).join(' or ');
    }
    return (await readAll(this.list(LIST.Rechnungspositionen), RECHNUNGSPOSITION_FIELDS, f)).map(rechnungspositionFromItem);
  }

  /** Alle Rechnungsnummern (für Eindeutigkeit und Nummernvorschlag). */
  public async getRechnungsnummern(): Promise<string[]> {
    return (await readAll(this.list(LIST.Rechnungen), ['Title'])).map((i) => i.Title as string);
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
    const lineIds: number[] = [];
    try {
      for (const line of lines) {
        const l: SPItem = await this.list(LIST.Rechnungspositionen).items.add(rechnungspositionToItem({ ...line, rechnungId }));
        lineIds.push(l.Id);
      }
    } catch (e) {
      await this.rollback(rechnungId, lineIds);
      throw e;
    }
    return { ...rechnung, id: rechnungId, pdfUrl: null };
  }

  private async rollback(rechnungId: number, lineIds: number[]): Promise<void> {
    for (const id of lineIds) {
      try {
        await this.list(LIST.Rechnungspositionen).items.getById(id).delete();
      } catch {
        // weiter aufräumen
      }
    }
    try {
      await this.list(LIST.Rechnungen).items.getById(rechnungId).delete();
    } catch {
      // Ursprünglicher Fehler wird vom Aufrufer gemeldet
    }
  }

  public async setStatus(id: number, status: RechnungsStatus): Promise<void> {
    await this.list(LIST.Rechnungen).items.getById(id).update({ Status: status });
  }

  /** Storniert eine erstellte Rechnung; ihre Zeiträume sind danach wieder frei. */
  public async stornieren(id: number): Promise<void> {
    await this.setStatus(id, 'Storniert');
  }

  /** Löscht einen Entwurf samt Positionen. Andere Status werden abgelehnt. */
  public async deleteEntwurf(id: number): Promise<void> {
    const item: SPItem = await this.list(LIST.Rechnungen).items.getById(id).select('Status')();
    if (item.Status !== 'Entwurf') throw new Error('Nur Entwürfe dürfen gelöscht werden.');
    const lines = await readAll(this.list(LIST.Rechnungspositionen), ['Id'], `RechnungId eq ${id}`);
    for (const l of lines) await this.list(LIST.Rechnungspositionen).items.getById(l.Id).delete();
    await this.list(LIST.Rechnungen).items.getById(id).delete();
  }

  public async setPdfLink(id: number, url: string, description: string): Promise<void> {
    await this.list(LIST.Rechnungen).items.getById(id).update({ PdfLink: { Url: url, Description: description } });
  }
}
