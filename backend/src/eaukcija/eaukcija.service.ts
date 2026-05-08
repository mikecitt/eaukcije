import { Injectable } from '@nestjs/common';
import * as https from 'https';

const TARGET_HOST = 'eaukcija.sud.rs';
const API_PATH    = '/WebApi.Proxy/api/EAukcija';
const CATEGORY_ID = '7';

@Injectable()
export class EaukcijaService {
  private apiPost(endpoint: string, payload: object): Promise<any> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify(payload);
      const options = {
        hostname: TARGET_HOST,
        port:     443,
        path:     `${API_PATH}${endpoint}`,
        method:   'POST',
        headers: {
          'Content-Type':   'application/json',
          'Accept':         'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent':     'Mozilla/5.0',
        },
      };

      const req = https.request(options, res => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode} from upstream API`));
          return;
        }
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.ResultCode !== '0') {
              reject(new Error(`API error ${parsed.ResultCode}: ${parsed.ResultMessage}`));
            } else {
              resolve(parsed.Data);
            }
          } catch (e) {
            reject(new Error(`Parse error: ${e.message}`));
          }
        });
      });

      req.setTimeout(30_000, () => {
        req.destroy(new Error('Request timeout'));
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  async fetchAllAuctions(): Promise<any[]> {
    const all = [];
    let page = 1;
    const pageSize = 500;

    while (true) {
      const data = await this.apiPost('/GetAuctionsByCategoryId', {
        CategoryId: CATEGORY_ID,
        ItemCount:  pageSize,
        PageCount:  page.toString(),
      });

      const auctions = data.Auctions || [];
      all.push(...auctions);

      if (auctions.length < pageSize) break;
      page++;
    }

    return all;
  }

  async fetchAuctionDetails(auctionId: string): Promise<any> {
    return this.apiPost('/GetImmovablePropertyDetails', {
      AuctionId: auctionId.toString(),
      Role:      null,
    });
  }
}
