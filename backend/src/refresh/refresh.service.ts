import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EaukcijaService } from '../eaukcija/eaukcija.service';

@Injectable()
export class RefreshService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eaukcija: EaukcijaService,
  ) {}

  // Refreshes a single auction straight from GetImmovablePropertyDetails.
  // Needed for auctions that have concluded and dropped out of the
  // category listing that runRefresh() pages through, so their final
  // status/price never gets picked up by the bulk refresh anymore.
  async refreshOne(id: string) {
    const { rows } = await this.db.query('SELECT raw_data FROM auctions WHERE id = $1', [id]);
    if (!rows.length) {
      throw new NotFoundException('Aukcija nije pronađena u bazi');
    }

    let details;
    try {
      details = await this.eaukcija.fetchAuctionDetails(id);
    } catch (e) {
      throw new InternalServerErrorException(`Preuzimanje podataka nije uspelo: ${e.message}`);
    }

    // The details payload's shape for auction fields isn't confirmed for
    // concluded auctions (they no longer show up in the category listing
    // to compare against) — check both a nested `Auction` object and the
    // response root, and only overwrite columns the response actually set.
    const src = details?.Auction || details || {};

    let raw;
    try {
      raw = JSON.parse(rows[0].raw_data || '{}');
    } catch {
      raw = {};
    }
    raw.details = details;
    raw.auction = { ...raw.auction, ...src };

    const fields: Record<string, any> = {
      auction_number:     src.AuctionNumber,
      short_description:  src.ShortDescription,
      status:             src.Status,
      status_translation: src.StatusTranslation,
      starting_price:     src.StartingPrice,
      start_date:         src.StartDate,
      end_date:           src.EndDate,
      property_type:      src.PropertyType,
      is_first_sale:      typeof src.IsFirstSale === 'boolean' ? (src.IsFirstSale ? 1 : 0) : undefined,
      place_name:         details?.Place?.Name,
      place_municipality: details?.Place?.Municipality,
    };

    const setClauses: string[] = [];
    const values: any[] = [];
    for (const [col, val] of Object.entries(fields)) {
      if (val !== undefined && val !== null && val !== '') {
        values.push(val);
        setClauses.push(`${col} = $${values.length}`);
      }
    }
    values.push(JSON.stringify(raw));
    setClauses.push(`raw_data = $${values.length}`);
    setClauses.push('details_fetched = 1');
    values.push(id);

    await this.db.query(
      `UPDATE auctions SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
      values,
    );

    const { rows: updated } = await this.db.query(
      `SELECT id, auction_number, short_description, place_name, place_municipality,
              status, status_translation, starting_price, start_date, end_date,
              property_type, is_first_sale, details_fetched, added_at
       FROM auctions WHERE id = $1`,
      [id],
    );
    return updated[0];
  }

  async runRefresh(onProgress: (msg: string, pct: number) => void = () => {}) {
    onProgress('Preuzimanje liste aukcija...', 0);

    const apiAuctions = await this.eaukcija.fetchAllAuctions();
    onProgress(`Pronađeno ${apiAuctions.length} aukcija. Provjera novih...`, 5);

    const { rows: existingRows } = await this.db.query('SELECT id FROM auctions');
    const existingIds = new Set(existingRows.map(r => r.id));

    const newAuctions      = apiAuctions.filter(a => !existingIds.has(String(a.Id)));
    const existingAuctions = apiAuctions.filter(a =>  existingIds.has(String(a.Id)));

    onProgress(`${newAuctions.length} novih, ${existingAuctions.length} postojećih. Ažuriranje...`, 8);

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      for (const a of existingAuctions) {
        await client.query(
          `UPDATE auctions
           SET status = $1, status_translation = $2, starting_price = $3, start_date = $4, end_date = $5
           WHERE id = $6`,
          [a.Status || '', a.StatusTranslation || '', a.StartingPrice, a.StartDate, a.EndDate, String(a.Id)],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    let processed = 0;
    let failed    = 0;

    for (let i = 0; i < newAuctions.length; i++) {
      const a  = newAuctions[i];
      const id = String(a.Id);

      let details = null;
      try {
        details = await this.eaukcija.fetchAuctionDetails(id);
      } catch (e) {
        console.error(`Details fetch failed for ${id}: ${e.message}`);
        failed++;
      }

      await this.db.query(
        `INSERT INTO auctions
           (id, auction_number, short_description, place_name, place_municipality,
            status, status_translation, starting_price, start_date, end_date,
            property_type, is_first_sale, details_fetched, raw_data)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (id) DO NOTHING`,
        [
          id,
          a.AuctionNumber        || '',
          a.ShortDescription     || '',
          details?.Place?.Name         || '',
          details?.Place?.Municipality || '',
          a.Status               || '',
          a.StatusTranslation    || '',
          a.StartingPrice        || 0,
          a.StartDate            || '',
          a.EndDate              || '',
          a.PropertyType         || '',
          a.IsFirstSale ? 1 : 0,
          details ? 1 : 0,
          JSON.stringify({ auction: a, details }),
        ],
      );

      processed++;
      if (processed % 5 === 0 || processed === newAuctions.length) {
        const pct = 8 + Math.round((processed / newAuctions.length) * 87);
        onProgress(
          `Obogaćeno ${processed}/${newAuctions.length} novih aukcija${failed ? ` (${failed} neuspelih)` : ''}`,
          pct,
        );
      }
    }

    const now = new Date().toISOString();
    await this.db.query(
      `INSERT INTO meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ['last_refresh', now],
    );

    return { newCount: newAuctions.length, updatedCount: existingAuctions.length, failedCount: failed, lastRefresh: now };
  }
}
