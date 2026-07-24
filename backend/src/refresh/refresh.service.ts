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
      current_price:      src.CurrentPrice,
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
              status, status_translation, starting_price, current_price, start_date, end_date,
              property_type, is_first_sale, details_fetched, added_at
       FROM auctions WHERE id = $1`,
      [id],
    );
    return updated[0];
  }

  // excludedStatuses: auctions already sitting in one of these statuses (per
  // the DB's *current* value, before this run) are skipped entirely — their
  // outcome is final and won't change, so there's no point spending a
  // GetImmovablePropertyDetails call on them every single refresh.
  async runRefresh(
    onProgress: (msg: string, pct: number) => void = () => {},
    excludedStatuses: string[] = [],
  ) {
    onProgress('Preuzimanje liste aukcija...', 0);

    const apiAuctions = await this.eaukcija.fetchAllAuctions();
    onProgress(`Pronađeno ${apiAuctions.length} aukcija. Provera novih...`, 5);

    const excluded = new Set(excludedStatuses.map(s => s.trim().toLowerCase()));

    const { rows: existingRows } = await this.db.query('SELECT id, status, raw_data FROM auctions');
    const existingRowById = new Map(existingRows.map(r => [r.id, r]));

    const newAuctions      = apiAuctions.filter(a => !existingRowById.has(String(a.Id)));
    const existingAuctions = apiAuctions.filter(a =>  existingRowById.has(String(a.Id)));

    const skipped = existingAuctions.filter(a =>
      excluded.has(String(existingRowById.get(String(a.Id))?.status || '').trim().toLowerCase()));
    const toRefresh = existingAuctions.filter(a =>
      !excluded.has(String(existingRowById.get(String(a.Id))?.status || '').trim().toLowerCase()));

    onProgress(
      `${newAuctions.length} novih, ${toRefresh.length} za osvežavanje, ${skipped.length} preskočeno (isključeni statusi). Obogaćivanje...`,
      8,
    );

    const toProcess = [
      ...newAuctions.map(a => ({ a, isNew: true })),
      ...toRefresh.map(a => ({ a, isNew: false })),
    ];

    let processed = 0;
    let failed    = 0;

    for (const { a, isNew } of toProcess) {
      const id = String(a.Id);

      // Full refresh, not just the summary fields from the category
      // listing: fetch GetImmovablePropertyDetails for every auction we
      // actually process (new or existing), same as a single-row refresh.
      let details = null;
      try {
        details = await this.eaukcija.fetchAuctionDetails(id);
      } catch (e) {
        console.error(`Details fetch failed for ${id}: ${e.message}`);
        failed++;
      }

      if (isNew) {
        await this.db.query(
          `INSERT INTO auctions
             (id, auction_number, short_description, place_name, place_municipality,
              status, status_translation, starting_price, current_price, start_date, end_date,
              property_type, is_first_sale, details_fetched, raw_data)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
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
            a.CurrentPrice         ?? null,
            a.StartDate            || '',
            a.EndDate              || '',
            a.PropertyType         || '',
            a.IsFirstSale ? 1 : 0,
            details ? 1 : 0,
            JSON.stringify({ auction: a, details }),
          ],
        );
      } else {
        let raw;
        try {
          raw = JSON.parse(existingRowById.get(id)?.raw_data || '{}');
        } catch {
          raw = {};
        }
        raw.auction = a;

        // Only touch place/raw-details/details_fetched when this round's
        // detail fetch actually succeeded — a transient failure shouldn't
        // blank out place info a previous successful refresh already found.
        const entries: [string, any][] = [
          ['auction_number',     a.AuctionNumber        || ''],
          ['short_description',  a.ShortDescription     || ''],
          ['status',             a.Status               || ''],
          ['status_translation', a.StatusTranslation    || ''],
          ['starting_price',     a.StartingPrice        || 0],
          ['current_price',      a.CurrentPrice         ?? null],
          ['start_date',         a.StartDate            || ''],
          ['end_date',           a.EndDate              || ''],
          ['property_type',      a.PropertyType         || ''],
          ['is_first_sale',      a.IsFirstSale ? 1 : 0],
        ];
        if (details) {
          raw.details = details;
          entries.push(
            ['place_name',         details?.Place?.Name         || ''],
            ['place_municipality', details?.Place?.Municipality || ''],
            ['details_fetched',    1],
          );
        }
        entries.push(['raw_data', JSON.stringify(raw)]);

        const setClauses = entries.map(([col], i) => `${col} = $${i + 1}`);
        const values: any[] = entries.map(([, val]) => val);
        values.push(id);

        await this.db.query(
          `UPDATE auctions SET ${setClauses.join(', ')} WHERE id = $${values.length}`,
          values,
        );
      }

      processed++;
      if (processed % 5 === 0 || processed === toProcess.length) {
        const pct = 8 + Math.round((processed / Math.max(toProcess.length, 1)) * 87);
        onProgress(
          `Obogaćeno ${processed}/${toProcess.length} aukcija${failed ? ` (${failed} neuspelih)` : ''}`,
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

    return {
      newCount:     newAuctions.length,
      updatedCount: toRefresh.length,
      skippedCount: skipped.length,
      failedCount:  failed,
      lastRefresh:  now,
    };
  }
}
