const express   = require('express');
const Anthropic  = require('@anthropic-ai/sdk');
const { pool }   = require('../db');

const router = express.Router();

router.post('/', async (req, res) => {
  const { description, ids } = req.body;

  if (!description || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Nedostaje opis ili lista ID-eva.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY nije podešen na serveru.' });
  }

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
  const { rows } = await pool.query(
    `SELECT id, short_description, place_name, place_municipality,
            starting_price, property_type, is_first_sale
     FROM auctions WHERE id IN (${placeholders})`,
    ids
  );

  const auctions = rows.map(a => ({
    id:           a.id,
    opis:         (a.short_description || '').slice(0, 120),
    mesto:        [a.place_name, a.place_municipality].filter(Boolean).join(', '),
    cena_rsd:     a.starting_price || 0,
    tip:          a.property_type  || '',
    prva_prodaja: a.is_first_sale  ? 'da' : 'ne',
  }));

  const client = new Anthropic();

  const prompt = `Ti si asistent koji filtrira liste aukcija nepokretnosti. \
Korisnik želi aukcije koje odgovaraju sledećem kriterijumu:

"${description}"

Lista aukcija (JSON):
${JSON.stringify(auctions)}

Vrati SAMO JSON objekat sa poljem "matchingIds" koje sadrži niz ID-eva aukcija koje \
odgovaraju kriterijumu. Ako ništa ne odgovara, vrati prazan niz. \
Nemoj pisati ništa osim JSON-a.`;

  try {
    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages:   [{ role: 'user', content: prompt }],
    });

    const text      = message.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Neispravan odgovor AI agenta.' });

    const result = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(result.matchingIds)) {
      return res.status(500).json({ error: 'Neispravan format odgovora AI agenta.' });
    }

    res.json({ matchingIds: result.matchingIds });
  } catch (err) {
    console.error('AI filter error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
