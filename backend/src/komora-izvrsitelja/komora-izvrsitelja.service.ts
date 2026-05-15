import { Injectable } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';

const BASE_URL    = 'https://www.komoraizvrsitelja.rs';
const SEARCH_PATH = '/oglasna_tabla/search.php';

interface OllamaExtracted {
  case_number:    string | null;
  description:    string | null;
  place:          string | null;
  municipality:   string | null;
  sale_date:      string | null; // YYYY-MM-DD
  starting_price: number | null;
  is_first_sale:  boolean | null;
}

@Injectable()
export class KomoraIzvrsiteljaService {
  private readonly courtArea =
    process.env.KOMORA_COURT ||
    'подручје Вишег суда у Новом Саду и Привредног суда у Новом Саду';

  private readonly ollamaUrl   = process.env.OLLAMA_URL   || 'http://localhost:11434';
  private readonly ollamaModel = process.env.OLLAMA_MODEL || 'llama3.2';

  // ── HTTP helper ───────────────────────────────────────────────────────────

  private request(
    url: string,
    opts: { method?: string; body?: string; headers?: Record<string, string>; timeoutMs?: number } = {},
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const parsed   = new URL(url);
      const lib      = parsed.protocol === 'https:' ? https : http;
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (compatible; AuctionBot/1.0)',
        'Accept': '*/*',
        ...opts.headers,
      };
      if (opts.body) headers['Content-Length'] = String(Buffer.byteLength(opts.body));

      const req = (lib as typeof https).request(
        { hostname: parsed.hostname, port: parsed.port || undefined, path: parsed.pathname + parsed.search, method: opts.method || 'GET', headers },
        res => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            const next = new URL(res.headers.location, url);
            resolve(this.request(next.toString(), opts));
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        },
      );

      req.setTimeout(opts.timeoutMs ?? 60_000, () => req.destroy(new Error('Request timeout')));
      req.on('error', reject);
      if (opts.body) req.write(opts.body);
      req.end();
    });
  }

  // ── Listing fetch ─────────────────────────────────────────────────────────

  async fetchListings(): Promise<Array<{ pdfUrl: string; fileName: string }>> {
    const body = new URLSearchParams({ userCourtS: this.courtArea }).toString();
    const buf  = await this.request(`${BASE_URL}${SEARCH_PATH}`, {
      method: 'POST',
      body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': `${BASE_URL}/oglasna_tabla/`,
      },
    });
    return this.parseHtml(buf.toString('utf-8'));
  }

  private parseHtml(html: string): Array<{ pdfUrl: string; fileName: string }> {
    const results: Array<{ pdfUrl: string; fileName: string }> = [];
    const re = /href=["']([^"']*\.pdf[^"']*)["'][^>]*>(.*?)<\/a>/gis;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const rawHref  = m[1];
      const linkText = m[2].replace(/<[^>]+>/g, '').trim();
      const fileName = decodeURIComponent(rawHref.split('/').pop() || '').replace(/\?.*$/, '');
      const combined = (fileName + ' ' + linkText).toLowerCase();

      if (
        combined.includes('непокретности') ||
        combined.includes('nepokretnosti') ||
        rawHref.toLowerCase().includes('%d0%bd%d0%b5%d0%bf%d0%be%d0%ba%d1%80%d0%b5%d1%82%d0%bd%d0%be%d1%81%d1%82%d0%b8')
      ) {
        const pdfUrl = rawHref.startsWith('http')
          ? rawHref
          : `${BASE_URL}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
        results.push({ pdfUrl, fileName });
      }
    }
    return results;
  }

  // ── Ollama extraction (primary) ───────────────────────────────────────────

  private async extractWithOllama(text: string): Promise<OllamaExtracted> {
    // Truncate to avoid overflowing context window; keep beginning (header/case info)
    // and a chunk around the last "ЈАВНА ПРОДАЈА" occurrence
    const trimmed = this.selectRelevantText(text, 5000);

    const prompt = `Ti si asistent koji parsira tekstove PDF oglasa srpskih sudskih aukcija nekretnina. Tekst može biti ćiriličan.

Iz teksta ispod izvuci sledeće podatke i vrati ih KAO JSON OBJEKAT (bez ikakvih objašnjenja van JSON-a):

{
  "case_number": "broj izvršnog predmeta npr И 123/2024 ili ИИ 456/2023 — string ili null",
  "description": "kratak opis nekretnine: tip (stan/kuća/...) i adresa, max 200 znakova — string ili null",
  "place": "ime mesta/grada — string ili null",
  "municipality": "opština — string ili null (može biti isto kao place)",
  "sale_date": "datum POSLEDNJE javne prodaje u formatu YYYY-MM-DD — string ili null",
  "starting_price": "početna cena u RSD kao ceo broj — number ili null",
  "is_first_sale": "true ako ПРВА ЈАВНА ПРОДАЈА, false ako ДРУГА/ТРЕЋА/... — boolean"
}

VAŽNO:
- Ako postoji više javnih prodaja (ПРВА, ДРУГА, ТРЕЋА...), uzmi datum i cenu za POSLEDNJU.
- Cene su u srpskom formatu: 1.234.567,89 = 1234567 RSD.
- Datumi su u formatu DD.MM.YYYY — konvertuj u YYYY-MM-DD.

Tekst PDF oglasa:
---
${trimmed}
---`;

    const body = JSON.stringify({
      model:   this.ollamaModel,
      messages: [{ role: 'user', content: prompt }],
      stream:  false,
      format:  'json',
      options: { temperature: 0 },
    });

    const buf  = await this.request(`${this.ollamaUrl}/api/chat`, {
      method:    'POST',
      body,
      headers:   { 'Content-Type': 'application/json' },
      timeoutMs: 120_000,
    });

    const json    = JSON.parse(buf.toString('utf-8'));
    const content = json?.message?.content || json?.response || '{}';
    return JSON.parse(content) as OllamaExtracted;
  }

  private selectRelevantText(text: string, maxChars: number): string {
    if (text.length <= maxChars) return text;

    // Always keep the first 2000 chars (header / case number / property info)
    const head = text.slice(0, 2000);

    // Find last occurrence of "ЈАВНА ПРОДАЈА" and take context around it
    const upper  = text.toUpperCase();
    const lastPos = upper.lastIndexOf('ЈАВНА ПРОДАЈА');
    if (lastPos === -1) return text.slice(0, maxChars);

    const tailStart = Math.max(2000, lastPos - 200);
    const tail      = text.slice(tailStart, tailStart + (maxChars - 2000));
    return head + '\n...\n' + tail;
  }

  // ── Auction data assembly ─────────────────────────────────────────────────

  private makeAuctionRecord(
    extracted: OllamaExtracted,
    pdfUrl:    string,
    fileName:  string,
    rawText:   string,
  ): Record<string, any> {
    const caseNumber = (extracted.case_number || fileName.replace(/\.pdf$/i, '')).slice(0, 80);
    const id         = `exec-${caseNumber.replace(/[^a-zA-Z0-9Ѐ-ӿ]/g, '-').replace(/-+/g, '-').slice(0, 60)}`;
    const saleDate   = extracted.sale_date
      ? `${extracted.sale_date}T00:00:00.000Z`
      : null;

    return {
      id,
      auction_number:     caseNumber,
      short_description:  (extracted.description || '').slice(0, 200),
      place_name:         extracted.place        || '',
      place_municipality: extracted.municipality || '',
      status:             'Јавна продаја',
      status_translation: 'Javna prodaja',
      starting_price:     Number(extracted.starting_price) || 0,
      start_date:         saleDate,
      end_date:           saleDate,
      is_first_sale:      extracted.is_first_sale === false ? 0 : 1,
      source:             'executor',
      pdf_url:            pdfUrl,
      raw_data:           JSON.stringify({ pdfUrl, fileName, textSample: rawText.slice(0, 3000) }),
    };
  }

  // ── Regex fallback (used when Ollama is unavailable) ─────────────────────

  private extractWithRegex(text: string, pdfUrl: string, fileName: string): Record<string, any> {
    const caseNumber = this.regexCaseNumber(text) || fileName.replace(/\.pdf$/i, '');
    const id         = `exec-${caseNumber.replace(/[^a-zA-Z0-9Ѐ-ӿ]/g, '-').replace(/-+/g, '-').slice(0, 60)}`;
    const { date, price, isFirst } = this.regexLastSale(text);
    const { placeName, municipality } = this.regexLocation(text);
    const description = this.regexDescription(text);

    return {
      id,
      auction_number:     caseNumber,
      short_description:  description,
      place_name:         placeName,
      place_municipality: municipality,
      status:             'Јавна продаја',
      status_translation: 'Javna prodaja',
      starting_price:     price,
      start_date:         date,
      end_date:           date,
      is_first_sale:      isFirst ? 1 : 0,
      source:             'executor',
      pdf_url:            pdfUrl,
      raw_data:           JSON.stringify({ pdfUrl, fileName, textSample: text.slice(0, 3000) }),
    };
  }

  private regexCaseNumber(text: string): string | null {
    const patterns = [
      /ИИ\s*[-–]?\s*\d+\s*\/\s*\d{4}/,
      /И\.И\.\s*\d+\s*\/\s*\d{4}/,
      /И\s*[-–]?\s*\d+\s*\/\s*\d{4}/,
      /Предмет[:\s]+([^\n]{3,40})/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[0].replace(/^Предмет[:\s]+/i, '').trim().slice(0, 60);
    }
    return null;
  }

  private regexDescription(text: string): string {
    const propWords = ['стан', 'кућа', 'земљиште', 'пословни', 'објекат', 'непокретност', 'зграда', 'локал', 'гаража', 'парцела'];
    const lines     = text.split('\n').map(l => l.trim()).filter(l => l.length > 15);
    for (const line of lines) {
      if (propWords.some(w => line.toLowerCase().includes(w))) return line.slice(0, 200);
    }
    return lines[0]?.slice(0, 200) || '';
  }

  private regexLocation(text: string): { placeName: string; municipality: string } {
    const cities = [
      'Нови Сад', 'Суботица', 'Зрењанин', 'Панчево', 'Кикинда', 'Сомбор',
      'Врбас', 'Бечеј', 'Инђија', 'Сремска Митровица', 'Рума', 'Стара Пазова',
      'Нови Бечеј', 'Темерин', 'Жабаљ', 'Тител', 'Србобран', 'Бачка Паланка',
      'Оџаци', 'Апатин', 'Кула', 'Бачки Петровац', 'Беочин', 'Ириг', 'Шид',
      'Шабац', 'Ваљево', 'Лозница', 'Бачка Топола', 'Мали Иђош', 'Сента',
    ];
    for (const city of cities) {
      if (text.includes(city)) return { placeName: city, municipality: city };
    }
    return { placeName: '', municipality: '' };
  }

  private regexLastSale(text: string): { date: string | null; price: number; isFirst: boolean } {
    const upper     = text.toUpperCase();
    const marker    = 'ЈАВНА ПРОДАЈА';
    const positions: number[] = [];
    let i = 0;
    while (true) {
      const pos = upper.indexOf(marker, i);
      if (pos === -1) break;
      positions.push(pos);
      i = pos + 1;
    }
    const isFirst = positions.length <= 1;
    if (positions.length === 0) {
      return { date: this.regexFirstDate(text), price: this.regexStartingPrice(text), isFirst: true };
    }
    const lastPos = positions[positions.length - 1];
    const window  = text.slice(lastPos, lastPos + 1000);
    return {
      date:    this.regexFirstDate(window) || this.regexFirstDate(text),
      price:   this.regexStartingPrice(window) || this.regexStartingPrice(text),
      isFirst,
    };
  }

  private regexFirstDate(text: string): string | null {
    const m = text.match(/(\d{1,2})\.(\d{2})\.(\d{4})/);
    if (!m) return null;
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00.000Z`;
  }

  private regexStartingPrice(text: string): number {
    const ctxMatch = text.match(/(?:почетн[аеуом]+\s+цен[аеуом]+)[:\s]+(\d[\d.,\s]*)/i);
    if (ctxMatch) {
      const n = this.parseSerbianNumber(ctxMatch[1].split('\n')[0].trim());
      if (n >= 1_000) return n;
    }
    const re = /(\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const n = parseInt(m[1].replace(/\./g, ''), 10);
      if (n >= 50_000) return n;
    }
    return 0;
  }

  private parseSerbianNumber(s: string): number {
    s = s.replace(/\s/g, '');
    if (/^\d{1,3}(\.\d{3})+/.test(s)) s = s.replace(/\./g, '');
    s = s.replace(',', '.');
    const n = parseFloat(s);
    return isNaN(n) ? 0 : Math.round(n);
  }

  // ── Main entry point ──────────────────────────────────────────────────────

  async fetchAllAuctions(): Promise<Array<Record<string, any>>> {
    const listings = await this.fetchListings();
    const results:  Array<Record<string, any>> = [];

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;

    for (const { pdfUrl, fileName } of listings) {
      try {
        const pdfBuf   = await this.request(pdfUrl);
        const { text } = await pdfParse(pdfBuf);

        let auction: Record<string, any>;
        try {
          const extracted = await this.extractWithOllama(text);
          auction = this.makeAuctionRecord(extracted, pdfUrl, fileName, text);
          console.log(`[komora] Ollama extracted: ${auction.auction_number}`);
        } catch (ollamaErr) {
          console.warn(`[komora] Ollama failed (${(ollamaErr as Error).message}), using regex for ${fileName}`);
          auction = this.extractWithRegex(text, pdfUrl, fileName);
        }

        results.push(auction);
      } catch (e) {
        console.error(`[komora] Failed to process ${pdfUrl}: ${(e as Error).message}`);
      }
    }

    return results;
  }
}
