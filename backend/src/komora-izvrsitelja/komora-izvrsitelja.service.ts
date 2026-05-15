import { Injectable } from '@nestjs/common';
import * as https from 'https';
import * as http from 'http';

const BASE_URL    = 'https://www.komoraizvrsitelja.rs';
const SEARCH_PATH = '/oglasna_tabla/search.php';

@Injectable()
export class KomoraIzvrsiteljaService {
  private readonly courtArea =
    process.env.KOMORA_COURT ||
    'подручје Вишег суда у Новом Саду и Привредног суда у Новом Саду';

  private request(
    url: string,
    opts: { method?: string; body?: string; headers?: Record<string, string> } = {},
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
        { hostname: parsed.hostname, path: parsed.pathname + parsed.search, method: opts.method || 'GET', headers },
        res => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            res.resume();
            const next = new URL(res.headers.location, url);
            resolve(this.request(next.toString()));
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        },
      );

      req.setTimeout(60_000, () => req.destroy(new Error('Request timeout')));
      req.on('error', reject);
      if (opts.body) req.write(opts.body);
      req.end();
    });
  }

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

      // Only process PDFs with "непокретности" in file name or link text
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

  // ── PDF text parsing ──────────────────────────────────────────────────────

  extractAuctionData(text: string, pdfUrl: string, fileName: string): Record<string, any> {
    const caseNumber = this.extractCaseNumber(text) || fileName.replace(/\.pdf$/i, '');
    const id         = `exec-${caseNumber.replace(/[^a-zA-Z0-9Ѐ-ӿ]/g, '-').replace(/-+/g, '-').slice(0, 60)}`;
    const { date, price, isFirst } = this.extractLastSale(text);
    const { placeName, municipality }  = this.extractLocation(text);
    const description = this.extractDescription(text);

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

  private extractCaseNumber(text: string): string | null {
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

  private extractDescription(text: string): string {
    const propWords = ['стан', 'кућа', 'земљиште', 'пословни', 'објекат', 'непокретност', 'зграда', 'локал', 'гаража', 'парцела'];
    const lines     = text.split('\n').map(l => l.trim()).filter(l => l.length > 15);
    for (const line of lines) {
      if (propWords.some(w => line.toLowerCase().includes(w))) return line.slice(0, 200);
    }
    return lines[0]?.slice(0, 200) || '';
  }

  private extractLocation(text: string): { placeName: string; municipality: string } {
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

  private extractLastSale(text: string): { date: string | null; price: number; isFirst: boolean } {
    const upper   = text.toUpperCase();
    const marker  = 'ЈАВНА ПРОДАЈА';
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
      return { date: this.findFirstDate(text), price: this.findStartingPrice(text), isFirst: true };
    }

    const lastPos = positions[positions.length - 1];
    const window  = text.slice(lastPos, lastPos + 1000);
    const date    = this.findFirstDate(window) || this.findFirstDate(text);
    const price   = this.findStartingPrice(window) || this.findStartingPrice(text);

    return { date, price, isFirst };
  }

  private findFirstDate(text: string): string | null {
    const m = text.match(/(\d{1,2})\.(\d{2})\.(\d{4})/);
    if (!m) return null;
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}T00:00:00.000Z`;
  }

  private findStartingPrice(text: string): number {
    // Try explicit "почетна цена" pattern first
    const ctxMatch = text.match(
      /(?:почетн[аеуом]+\s+цен[аеуом]+)[:\s]+(\d[\d.,\s]*)/i,
    );
    if (ctxMatch) {
      const n = this.parseSerbianNumber(ctxMatch[1].split('\n')[0].trim());
      if (n >= 1_000) return n;
    }
    // Fallback: first Serbian-formatted number >= 50 000
    const re = /(\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const n = parseInt(m[1].replace(/\./g, ''), 10);
      if (n >= 50_000) return n;
    }
    return 0;
  }

  private parseSerbianNumber(s: string): number {
    // "1.234.567,89" → 1234567
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

    for (const { pdfUrl, fileName } of listings) {
      try {
        const pdfBuf  = await this.request(pdfUrl);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string }>;
        const { text } = await pdfParse(pdfBuf);
        const auction  = this.extractAuctionData(text, pdfUrl, fileName);
        results.push(auction);
      } catch (e) {
        console.error(`[komora] Failed to process ${pdfUrl}: ${(e as Error).message}`);
      }
    }

    return results;
  }
}
