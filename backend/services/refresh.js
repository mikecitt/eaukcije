const { pool } = require('../db');
const { fetchAllAuctions, fetchAuctionDetails } = require('../eaukcija-client');

// onProgress(msg, pct) — optional callback for streaming progress
async function runRefresh(onProgress = () => {}) {
  onProgress('Preuzimanje liste aukcija...', 0);

  const apiAuctions = await fetchAllAuctions();
  onProgress(`Pronađeno ${apiAuctions.length} aukcija. Provjera novih...`, 5);

  const { rows: existingRows } = await pool.query('SELECT id FROM auctions');
  const existingIds = new Set(existingRows.map(r => r.id));

  const newAuctions      = apiAuctions.filter(a => !existingIds.has(String(a.Id)));
  const existingAuctions = apiAuctions.filter(a =>  existingIds.has(String(a.Id)));

  onProgress(`${newAuctions.length} novih, ${existingAuctions.length} postojećih. Ažuriranje...`, 8);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const a of existingAuctions) {
      await client.query(
        `UPDATE auctions
         SET status = $1, status_translation = $2, starting_price = $3, start_date = $4, end_date = $5
         WHERE id = $6`,
        [a.Status || '', a.StatusTranslation || '', a.StartingPrice, a.StartDate, a.EndDate, String(a.Id)]
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
      details = await fetchAuctionDetails(id);
    } catch (e) {
      console.error(`Details fetch failed for ${id}: ${e.message}`);
      failed++;
    }

    await pool.query(
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
      ]
    );

    processed++;
    if (processed % 5 === 0 || processed === newAuctions.length) {
      const pct = 8 + Math.round((processed / newAuctions.length) * 87);
      onProgress(
        `Obogaćeno ${processed}/${newAuctions.length} novih aukcija${failed ? ` (${failed} neuspelih)` : ''}`,
        pct
      );
    }
  }

  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    ['last_refresh', now]
  );

  return { newCount: newAuctions.length, updatedCount: existingAuctions.length, failedCount: failed, lastRefresh: now };
}

module.exports = { runRefresh };
