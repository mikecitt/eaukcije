const express = require('express');
const router  = express.Router();
const db      = require('../db');

router.get('/', (req, res) => {
  try {
    const auctions  = db.prepare(`
      SELECT id, auction_number, short_description, place_name, place_municipality,
             status, status_translation, starting_price, start_date, end_date,
             property_type, is_first_sale, details_fetched, added_at
      FROM auctions ORDER BY added_at DESC
    `).all();
    const meta      = db.prepare('SELECT value FROM meta WHERE key = ?').get('last_refresh');
    res.json({ auctions, lastRefresh: meta?.value || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/', (req, res) => {
  const required = process.env.DB_REMOVE_PASSWORD;
  if (!required) {
    return res.status(500).json({ error: 'DB_REMOVE_PASSWORD nije podešena u .env' });
  }
  const { password } = req.body || {};
  if (!password || password !== required) {
    return res.status(403).json({ error: 'Pogrešna lozinka' });
  }
  try {
    db.prepare('DELETE FROM auctions').run();
    db.prepare('DELETE FROM meta WHERE key = ?').run('last_refresh');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
