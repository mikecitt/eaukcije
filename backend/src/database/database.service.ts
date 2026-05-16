import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  readonly pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  async onModuleInit() {
    await this.pool.query(`
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

    // Rollback migration — drops executor-auction columns added in previous deploy
    await this.pool.query(`
      ALTER TABLE auctions DROP COLUMN IF EXISTS source;
      ALTER TABLE auctions DROP COLUMN IF EXISTS pdf_url;
    `);
  }

  query(text: string, values?: any[]) {
    return this.pool.query(text, values);
  }

  connect() {
    return this.pool.connect();
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
