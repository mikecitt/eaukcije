import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class FavoritesService {
  constructor(private readonly db: DatabaseService) {}

  async list(userId: number): Promise<string[]> {
    const { rows } = await this.db.query(
      'SELECT auction_id FROM favorites WHERE user_id = $1',
      [userId],
    );
    return rows.map(r => r.auction_id);
  }

  async add(userId: number, auctionId: string) {
    const { rows } = await this.db.query('SELECT id FROM auctions WHERE id = $1', [auctionId]);
    if (rows.length === 0) {
      throw new NotFoundException('Aukcija nije pronađena.');
    }
    await this.db.query(
      `INSERT INTO favorites (user_id, auction_id) VALUES ($1, $2)
       ON CONFLICT (user_id, auction_id) DO NOTHING`,
      [userId, auctionId],
    );
    return { ok: true };
  }

  async remove(userId: number, auctionId: string) {
    await this.db.query(
      'DELETE FROM favorites WHERE user_id = $1 AND auction_id = $2',
      [userId, auctionId],
    );
    return { ok: true };
  }
}
