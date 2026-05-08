const https = require('https');

const TARGET_HOST = 'eaukcija.sud.rs';
const API_PATH    = '/WebApi.Proxy/api/EAukcija';
const CATEGORY_ID = '7';

function apiPost(endpoint, payload) {
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

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function fetchAllAuctions() {
  const all = [];
  let page = 1;
  const pageSize = 500;

  while (true) {
    const data = await apiPost('/GetAuctionsByCategoryId', {
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

async function fetchAuctionDetails(auctionId) {
  return await apiPost('/GetImmovablePropertyDetails', {
    AuctionId: auctionId.toString(),
    Role:      null,
  });
}

module.exports = { fetchAllAuctions, fetchAuctionDetails };
