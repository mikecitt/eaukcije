import { Injectable, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AiFilterService {
  constructor(private readonly db: DatabaseService) {}

  async filter(description: string, ids: string[]) {
    if (!description || !Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('Nedostaje opis ili lista ID-eva.');
    }

    if (!process.env.GEMINI_API_KEY) {
      throw new InternalServerErrorException('GEMINI_API_KEY nije podešen na serveru.');
    }

    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await this.db.query(
      `SELECT id, short_description, place_name, place_municipality,
              starting_price, property_type, is_first_sale
       FROM auctions WHERE id IN (${placeholders})`,
      ids,
    );

    const auctions = rows.map(a => ({
      id:           a.id,
      opis:         (a.short_description || '').slice(0, 120),
      mesto:        [a.place_name, a.place_municipality].filter(Boolean).join(', '),
      cena_rsd:     a.starting_price || 0,
      tip:          a.property_type  || '',
      prva_prodaja: a.is_first_sale  ? 'da' : 'ne',
    }));

    const prompt = `Ti si asistent koji filtrira liste aukcija nepokretnosti. \
Korisnik želi aukcije koje odgovaraju sledećem kriterijumu:

"${description}"

Lista aukcija (JSON):
${JSON.stringify(auctions)}

Vrati SAMO JSON objekat sa poljem "matchingIds" koje sadrži niz ID-eva aukcija koje \
odgovaraju kriterijumu. Ako ništa ne odgovara, vrati prazan niz. \
Nemoj pisati ništa osim JSON-a.`;

    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      const text   = result.response.text().trim();

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new InternalServerErrorException('Neispravan odgovor AI agenta.');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed.matchingIds)) {
        throw new InternalServerErrorException('Neispravan format odgovora AI agenta.');
      }

      const inputIdSet = new Set(ids);
      const matchingIds = parsed.matchingIds.filter((id: string) => inputIdSet.has(id));
      return { matchingIds };
    } catch (err) {
      if (err.status) throw err;
      console.error('AI filter error:', err.message);
      throw new InternalServerErrorException(err.message);
    }
  }
}
