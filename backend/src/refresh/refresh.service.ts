import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EaukcijaService } from '../eaukcija/eaukcija.service';

@Injectable()
export class RefreshService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eaukcija: EaukcijaService,
  ) {}

  async runRefresh(onProgress: (msg: string, pct: number) => void = () => {}) {
    onProgress('Preuzimanje liste aukcija...', 0);

    const apiAuctions = await this.eaukcija.fetchAllAuctions();
    onProgress(`Pronađeno ${apiAuctions.length} aukcija. Provjera novih...`, 5);

    const existingRows = await this.prisma.auction.findMany({ select: { id: true } });
    const existingIds = new Set(existingRows.map(r => r.id));

    const newAuctions      = apiAuctions.filter(a => !existingIds.has(String(a.Id)));
    const existingAuctions = apiAuctions.filter(a =>  existingIds.has(String(a.Id)));

    onProgress(`${newAuctions.length} novih, ${existingAuctions.length} postojećih. Ažuriranje...`, 8);

    await this.prisma.$transaction(
      existingAuctions.map(a => this.prisma.auction.update({
        where: { id: String(a.Id) },
        data: {
          status:             a.Status             || '',
          status_translation: a.StatusTranslation  || '',
          starting_price:     a.StartingPrice      || 0,
          start_date:         a.StartDate          || '',
          end_date:           a.EndDate            || '',
        },
      })),
    );

    let processed = 0;
    let failed    = 0;

    for (let i = 0; i < newAuctions.length; i++) {
      const a  = newAuctions[i];
      const id = String(a.Id);

      let details = null;
      try {
        details = await this.eaukcija.fetchAuctionDetails(id);
      } catch (e) {
        console.error(`Details fetch failed for ${id}: ${e.message}`);
        failed++;
      }

      await this.prisma.auction.createMany({
        data: [{
          id,
          auction_number:     a.AuctionNumber        || '',
          short_description:  a.ShortDescription     || '',
          place_name:         details?.Place?.Name         || '',
          place_municipality: details?.Place?.Municipality || '',
          status:             a.Status               || '',
          status_translation: a.StatusTranslation    || '',
          starting_price:     a.StartingPrice        || 0,
          start_date:         a.StartDate            || '',
          end_date:           a.EndDate              || '',
          property_type:      a.PropertyType         || '',
          is_first_sale:      a.IsFirstSale ? 1 : 0,
          details_fetched:    details ? 1 : 0,
          raw_data:           JSON.stringify({ auction: a, details }),
        }],
        skipDuplicates: true,
      });

      processed++;
      if (processed % 5 === 0 || processed === newAuctions.length) {
        const pct = 8 + Math.round((processed / newAuctions.length) * 87);
        onProgress(
          `Obogaćeno ${processed}/${newAuctions.length} novih aukcija${failed ? ` (${failed} neuspelih)` : ''}`,
          pct,
        );
      }
    }

    const now = new Date().toISOString();
    await this.prisma.meta.upsert({
      where:  { key: 'last_refresh' },
      create: { key: 'last_refresh', value: now },
      update: { value: now },
    });

    return { newCount: newAuctions.length, updatedCount: existingAuctions.length, failedCount: failed, lastRefresh: now };
  }
}
