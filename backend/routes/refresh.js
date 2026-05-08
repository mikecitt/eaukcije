const express  = require('express');
const router   = express.Router();
const db       = require('../db');
const { fetchAllAuctions, fetchAuctionDetails } = require('../eaukcija-client');
const { cyrToLat } = require('../utils');

router.post('/', async (req, res) => {
  res.setHeader('Content-Type',  'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection',    'keep-alive');
  res.flushHeaders();

  const send = data => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    send({ type: 'status', message: 'Preuzimanje liste aukcija...' });

    const apiAuctions = await fetchAllAuctions();
    send({ type: 'status', message: `Pronađeno ${apiAuctions.length} aukcija. Provjera novih...` });

    const existingIds = new Set(
      db.prepare('SELECT id FROM auctions').all().map(r => r.id)
    );

    const newAuctions      = apiAuctions.filter(a => !existingIds.has(String(a.Id)));
    const existingAuctions = apiAuctions.filter(a =>  existingIds.has(String(a.Id)));

    send({
      type: 'status',
      message: `${newAuctions.length} novih, ${existingAuctions.length} postojećih. Ažuriranje...`,
    });

    // Update basic mutable fields of existing auctions (status, price, dates may change)
    const updateStmt = db.prepare(`
      UPDATE auctions
      SET status = ?, status_translation = ?, starting_price = ?, start_date = ?, end_date = ?
      WHERE id = ?
    `);
    const bulkUpdate = db.transaction(list => {
      for (const a of list) {
        updateStmt.run(
          cyrToLat(a.Status || ''), cyrToLat(a.StatusTranslation || ''),
          a.StartingPrice, a.StartDate, a.EndDate,
          String(a.Id)
        );
      }
    });
    bulkUpdate(existingAuctions);

    // Fetch details for new auctions and insert
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
        cyrToLat(a.AuctionNumber       || ''),
        cyrToLat(a.ShortDescription    || ''),
        cyrToLat(details?.Place?.Name         || ''),
        cyrToLat(details?.Place?.Municipality || ''),
        cyrToLat(a.Status              || ''),
        cyrToLat(a.StatusTranslation   || ''),
        a.StartingPrice      || 0,
        a.StartDate          || '',
        a.EndDate            || '',
        cyrToLat(a.PropertyType        || ''),
        a.IsFirstSale ? 1 : 0,
        details ? 1 : 0,
        JSON.stringify({ auction: a, details }),
      );

      processed++;
      if (processed % 5 === 0 || processed === newAuctions.length) {
        send({
          type:    'progress',
          current: processed,
          total:   newAuctions.length,
          message: `Obogaćeno ${processed}/${newAuctions.length} novih aukcija${failed ? ` (${failed} neuspelih)` : ''}`,
        });
      }
    }

    const now = new Date().toISOString();
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('last_refresh', now);

    send({
      type:         'done',
      newCount:     newAuctions.length,
      updatedCount: existingAuctions.length,
      failedCount:  failed,
      lastRefresh:  now,
    });
  } catch (err) {
    console.error('Refresh error:', err);
    send({ type: 'error', message: err.message });
  }

  res.end();
});

module.exports = router;
