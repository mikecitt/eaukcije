const express = require('express');
const router  = express.Router();
const { pool } = require('../db');

router.get('/', async (req, res) => {
  try {
    const { rows: auctions } = await pool.query(`
      SELECT id, auction_number, short_description, place_name, place_municipality,
             status, status_translation, starting_price, start_date, end_date,
             property_type, is_first_sale, details_fetched, added_at
      FROM auctions ORDER BY added_at DESC
    `);
    const { rows } = await pool.query('SELECT value FROM meta WHERE key = $1', ['last_refresh']);
    res.json({ auctions, lastRefresh: rows[0]?.value || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/', async (req, res) => {
  const required = process.env.DB_REMOVE_PASSWORD;
  if (!required) {
    return res.status(500).json({ error: 'DB_REMOVE_PASSWORD nije podešena u .env' });
  }
  const { password } = req.body || {};
  if (!password || password !== required) {
    return res.status(403).json({ error: 'Pogrešna lozinka' });
  }
  try {
    await pool.query('DELETE FROM auctions');
    await pool.query('DELETE FROM meta WHERE key = $1', ['last_refresh']);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
