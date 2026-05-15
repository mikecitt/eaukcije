import { Injectable, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AuctionsService {
  constructor(private readonly db: DatabaseService) {}

  async findAll() {
    const { rows: auctions } = await this.db.query(`
      SELECT id, auction_number, short_description, place_name, place_municipality,
             status, status_translation, starting_price, start_date, end_date,
             property_type, is_first_sale, details_fetched, added_at,
             COALESCE(source, 'court') AS source, pdf_url
      FROM auctions ORDER BY added_at DESC
    `);
    const { rows } = await this.db.query(
      'SELECT value FROM meta WHERE key = $1',
      ['last_refresh'],
    );
    return { auctions, lastRefresh: rows[0]?.value || null };
  }

  async deleteAll(password: string) {
    const required = process.env.DB_REMOVE_PASSWORD;
    if (!required) {
      throw new InternalServerErrorException('DB_REMOVE_PASSWORD nije podešena u .env');
    }
    if (!password || password !== required) {
      throw new ForbiddenException('Pogrešna lozinka');
    }
    await this.db.query('DELETE FROM auctions');
    await this.db.query('DELETE FROM meta WHERE key = $1', ['last_refresh']);
    return { ok: true };
  }
}
