const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS auctions (
      id                  TEXT PRIMARY KEY,
      auction_number      TEXT,
      short_description   TEXT,
      place_name          TEXT,
      place_municipality  TEXT,
      status              TEXT,
      status_translation  TEXT,
      starting_price      REAL,
      start_date          TEXT,
      end_date            TEXT,
      property_type       TEXT,
      is_first_sale       INTEGER DEFAULT 0,
      details_fetched     INTEGER DEFAULT 0,
      raw_data            TEXT,
      added_at            TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS meta (
      key   TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

module.exports = { pool, initDb };
