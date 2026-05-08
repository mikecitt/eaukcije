import { Injectable, ForbiddenException, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuctionsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const auctions = await this.prisma.auction.findMany({
      orderBy: { added_at: 'desc' },
      select: {
        id: true, auction_number: true, short_description: true,
        place_name: true, place_municipality: true, status: true,
        status_translation: true, starting_price: true, start_date: true,
        end_date: true, property_type: true, is_first_sale: true,
        details_fetched: true, added_at: true,
      },
    });
    const meta = await this.prisma.meta.findUnique({ where: { key: 'last_refresh' } });
    return { auctions, lastRefresh: meta?.value || null };
  }

  async deleteAll(password: string) {
    const required = process.env.DB_REMOVE_PASSWORD;
    if (!required) {
      throw new InternalServerErrorException('DB_REMOVE_PASSWORD nije podešena u .env');
    }
    if (!password || password !== required) {
      throw new ForbiddenException('Pogrešna lozinka');
    }
    await this.prisma.auction.deleteMany();
    await this.prisma.meta.deleteMany({ where: { key: 'last_refresh' } });
    return { ok: true };
  }
}
