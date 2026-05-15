import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { EaukcijaService } from '../eaukcija/eaukcija.service';
import { KomoraIzvrsiteljaService } from '../komora-izvrsitelja/komora-izvrsitelja.service';

@Injectable()
export class RefreshService {
  constructor(
    private readonly db:      DatabaseService,
    private readonly eaukcija: EaukcijaService,
    private readonly komora:   KomoraIzvrsiteljaService,
  ) {}

  async runRefresh(onProgress: (msg: string, pct: number) => void = () => {}) {
    // ── Phase 1 (0–50 %): court auctions from eaukcija.sud.rs ─────────────
    const courtResult = await this.refreshCourtAuctions(onProgress);

    // ── Phase 2 (50–100 %): executor auctions from komoraizvrsitelja.rs ───
    const executorResult = await this.refreshExecutorAuctions(onProgress);

    const now = new Date().toISOString();
    await this.db.query(
      `INSERT INTO meta (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      ['last_refresh', now],
    );

    return {
      newCount:     courtResult.newCount     + executorResult.newCount,
      updatedCount: courtResult.updatedCount + executorResult.updatedCount,
      failedCount:  courtResult.failedCount  + executorResult.failedCount,
      lastRefresh:  now,
    };
  }

  // ── Court auctions ────────────────────────────────────────────────────────

  private async refreshCourtAuctions(onProgress: (msg: string, pct: number) => void) {
    onProgress('Preuzimanje sudskih aukcija...', 0);

    const apiAuctions = await this.eaukcija.fetchAllAuctions();
    onProgress(`Pronađeno ${apiAuctions.length} sudskih aukcija. Provjera novih...`, 4);

    const { rows: existingRows } = await this.db.query(
      "SELECT id FROM auctions WHERE COALESCE(source, 'court') = 'court'",
    );
    const existingIds = new Set(existingRows.map(r => r.id));

    const newAuctions      = apiAuctions.filter(a => !existingIds.has(String(a.Id)));
    const existingAuctions = apiAuctions.filter(a =>  existingIds.has(String(a.Id)));

    onProgress(`${newAuctions.length} novih, ${existingAuctions.length} postojećih. Ažuriranje...`, 6);

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

    for (const a of newAuctions) {
      const id = String(a.Id);

      let details = null;
      try {
        details = await this.eaukcija.fetchAuctionDetails(id);
      } catch (e) {
        console.error(`Details fetch failed for ${id}: ${(e as Error).message}`);
        failed++;
      }

      await this.db.query(
        `INSERT INTO auctions
           (id, auction_number, short_description, place_name, place_municipality,
            status, status_translation, starting_price, start_date, end_date,
            property_type, is_first_sale, details_fetched, raw_data, source)
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
          a.StartDate            || '',
          a.EndDate              || '',
          a.PropertyType         || '',
          a.IsFirstSale ? 1 : 0,
          details ? 1 : 0,
          JSON.stringify({ auction: a, details }),
          'court',
        ],
      );

      processed++;
      if (processed % 5 === 0 || processed === newAuctions.length) {
        const pct = 6 + Math.round((processed / Math.max(newAuctions.length, 1)) * 44);
        onProgress(
          `Sudske: ${processed}/${newAuctions.length} novih${failed ? ` (${failed} neuspelih)` : ''}`,
          pct,
        );
      }
    }

    return { newCount: newAuctions.length, updatedCount: existingAuctions.length, failedCount: failed };
  }

  // ── Executor auctions ─────────────────────────────────────────────────────

  private async refreshExecutorAuctions(onProgress: (msg: string, pct: number) => void) {
    onProgress('Preuzimanje oglasa komore izvršitelja...', 50);

    let executorAuctions: Array<Record<string, any>> = [];
    try {
      executorAuctions = await this.komora.fetchAllAuctions();
    } catch (e) {
      console.error(`[komora] Fetch failed: ${(e as Error).message}`);
      onProgress('Greška pri preuzimanju oglasa izvršitelja.', 50);
      return { newCount: 0, updatedCount: 0, failedCount: 1 };
    }

    onProgress(`Pronađeno ${executorAuctions.length} oglasa izvršitelja. Upisivanje...`, 55);

    const { rows: existingRows } = await this.db.query(
      "SELECT id FROM auctions WHERE source = 'executor'",
    );
    const existingIds = new Set(existingRows.map(r => r.id));

    let newCount     = 0;
    let updatedCount = 0;

    for (let i = 0; i < executorAuctions.length; i++) {
      const a = executorAuctions[i];
      if (existingIds.has(a.id)) {
        // Update mutable fields
        await this.db.query(
          `UPDATE auctions
           SET starting_price = $1, start_date = $2, end_date = $3,
               status = $4, status_translation = $5, raw_data = $6
           WHERE id = $7`,
          [a.starting_price, a.start_date, a.end_date, a.status, a.status_translation, a.raw_data, a.id],
        );
        updatedCount++;
      } else {
        await this.db.query(
          `INSERT INTO auctions
             (id, auction_number, short_description, place_name, place_municipality,
              status, status_translation, starting_price, start_date, end_date,
              property_type, is_first_sale, details_fetched, raw_data, source, pdf_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (id) DO NOTHING`,
          [
            a.id,
            a.auction_number      || '',
            a.short_description   || '',
            a.place_name          || '',
            a.place_municipality  || '',
            a.status              || '',
            a.status_translation  || '',
            a.starting_price      || 0,
            a.start_date          || null,
            a.end_date            || null,
            '',      // property_type — not applicable
            a.is_first_sale,
            0,       // details_fetched
            a.raw_data,
            'executor',
            a.pdf_url,
          ],
        );
        newCount++;
      }

      if (i % 3 === 0 || i === executorAuctions.length - 1) {
        const pct = 55 + Math.round(((i + 1) / Math.max(executorAuctions.length, 1)) * 45);
        onProgress(`Izvršitelji: ${i + 1}/${executorAuctions.length} obrađeno`, pct);
      }
    }

    return { newCount, updatedCount, failedCount: 0 };
  }
}
