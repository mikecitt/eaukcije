import { Injectable, NotFoundException, InternalServerErrorException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EaukcijaService } from '../eaukcija/eaukcija.service';

@Injectable()
export class RefreshService {
  constructor(
    private readonly db: DatabaseService,
    private readonly eaukcija: EaukcijaService,
  ) {}

  // Builds UPDATE entries for an auction we only have GetImmovablePropertyDetails
  // for (no fresh category-listing data) — used both for a single-row refresh
  // and for bulk-refreshing auctions that have fallen off the listing. The
  // field shape for concluded auctions isn't confirmed, so this only
  // overwrites columns the response actually set (checking both a nested
  // `Auction` object and the response root).
  private buildDetailsOnlyEntries(rawDataJson: string | null | undefined, details: any): [string, any][] {
    const src = details?.Auction || details || {};

    let raw: any;
    try {
      raw = JSON.parse(rawDataJson || '{}');
    } catch {
      raw = {};
    }
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
    };

    const entries: [string, any][] = Object.entries(fields)
      .filter(([, val]) => val !== undefined && val !== null && val !== '');

    if (details) {
      raw.details = details;
      entries.push(
        ['place_name',         details?.Place?.Name         || ''],
        ['place_municipality', details?.Place?.Municipality || ''],
        ['details_fetched',    1],
      );
    }
    entries.push(['raw_data', JSON.stringify(raw)]);

    return entries;
  }

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

    const entries = this.buildDetailsOnlyEntries(rows[0].raw_data, details);
    const setClauses = entries.map(([col], i) => `${col} = $${i + 1}`);
    const values: any[] = entries.map(([, val]) => val);
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
    const isExcluded = (status: any) => excluded.has(String(status || '').trim().toLowerCase());

    const { rows: existingRows } = await this.db.query('SELECT id, status, raw_data FROM auctions');
    const existingRowById = new Map(existingRows.map(r => [r.id, r]));
    const apiIds = new Set(apiAuctions.map(a => String(a.Id)));

    const newAuctions    = apiAuctions.filter(a => !existingRowById.has(String(a.Id)));
    const listedExisting = apiAuctions.filter(a =>  existingRowById.has(String(a.Id)));
    // Auctions eaukcija.sud.rs no longer returns in the category listing at
    // all — typically because they've concluded — used to never get
    // touched again by the bulk refresh once they fell off. Still refresh
    // them straight from GetImmovablePropertyDetails, just without fresh
    // list-level fields to fall back on.
    const missingIds = [...existingRowById.keys()].filter(id => !apiIds.has(id));

    const skippedListed    = listedExisting.filter(a => isExcluded(existingRowById.get(String(a.Id))?.status));
    const toRefreshListed  = listedExisting.filter(a => !isExcluded(existingRowById.get(String(a.Id))?.status));
    const skippedMissing   = missingIds.filter(id => isExcluded(existingRowById.get(id)?.status));
    const toRefreshMissing = missingIds.filter(id => !isExcluded(existingRowById.get(id)?.status));

    const skippedCount = skippedListed.length + skippedMissing.length;
    const updatedCount = toRefreshListed.length + toRefreshMissing.length;

    onProgress(
      `${newAuctions.length} novih, ${updatedCount} za osvežavanje, ${skippedCount} preskočeno (isključeni statusi). Obogaćivanje...`,
      8,
    );

    const toProcess = [
      ...newAuctions.map(a => ({ id: String(a.Id), a, isNew: true })),
      ...toRefreshListed.map(a => ({ id: String(a.Id), a, isNew: false })),
      ...toRefreshMissing.map(id => ({ id, a: null as any, isNew: false })),
    ];

    let processed = 0;
    let failed    = 0;

    for (const { id, a, isNew } of toProcess) {
      // Full refresh, not just the summary fields from the category
      // listing: fetch GetImmovablePropertyDetails for every auction we
      // actually process (new, listed-existing, or fallen off the listing).
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
      } else if (a) {
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
      } else {
        // No list data at all — this auction has fallen off the category
        // listing. Derive fields straight from GetImmovablePropertyDetails
        // instead of the (nonexistent) listing snapshot.
        const entries = this.buildDetailsOnlyEntries(existingRowById.get(id)?.raw_data, details);
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
      newCount: newAuctions.length,
      updatedCount,
      skippedCount,
      failedCount: failed,
      lastRefresh: now,
    };
  }
}
