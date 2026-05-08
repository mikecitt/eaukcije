const db = require('../db');
const { fetchAllAuctions, fetchAuctionDetails } = require('../eaukcija-client');

// onProgress(msg, pct) — optional callback for streaming progress
async function runRefresh(onProgress = () => {}) {
  onProgress('Preuzimanje liste aukcija...', 0);

  const apiAuctions = await fetchAllAuctions();
  onProgress(`Pronađeno ${apiAuctions.length} aukcija. Provjera novih...`, 5);

  const existingIds = new Set(
    db.prepare('SELECT id FROM auctions').all().map(r => r.id)
  );

  const newAuctions      = apiAuctions.filter(a => !existingIds.has(String(a.Id)));
  const existingAuctions = apiAuctions.filter(a =>  existingIds.has(String(a.Id)));

  onProgress(`${newAuctions.length} novih, ${existingAuctions.length} postojećih. Ažuriranje...`, 8);

  const updateStmt = db.prepare(`
    UPDATE auctions
    SET status = ?, status_translation = ?, starting_price = ?, start_date = ?, end_date = ?
    WHERE id = ?
  `);
  db.transaction(list => {
    for (const a of list) {
      updateStmt.run(
        a.Status || '', a.StatusTranslation || '',
        a.StartingPrice, a.StartDate, a.EndDate,
        String(a.Id)
      );
    }
  })(existingAuctions);

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO auctions
      (id, auction_number, short_description, place_name, place_municipality,
       status, status_translation, starting_price, start_date, end_date,
       property_type, is_first_sale, details_fetched, raw_data)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

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

    insertStmt.run(
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
  db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('last_refresh', now);

  return { newCount: newAuctions.length, updatedCount: existingAuctions.length, failedCount: failed, lastRefresh: now };
}

module.exports = { runRefresh };
