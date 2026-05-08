const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'aukcije.db'));

db.exec(`
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
    added_at            TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

module.exports = db;
