# EAukcija - Serbian Court Auction Dashboard

Full-stack TypeScript application for browsing Serbian court auctions (`eaukcija.sud.rs`) with a web dashboard.

## Quick Start

```bash
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

## Features

✅ **Web Dashboard** — Beautiful table view to browse auctions  
✅ **Local Database** — SQLite stores all fetched data (at `data/aukcije.db`)  
✅ **Live Reload** — Fetch latest auctions on-demand with a single click  
✅ **Category Filter** — Select from 16 auction categories  
✅ **Persistent Data** — Refresh the page, data stays (no re-fetch needed)  
✅ **Full TypeScript** — Type-safe API client and server  
✅ **Responsive Design** — Works on mobile and desktop  

## Tech Stack

- **Backend**: Express.js + Node.js
- **Database**: SQLite via better-sqlite3 (file-based, no setup)
- **Frontend**: Vanilla HTML/CSS/JavaScript (single file, no build)
- **API Client**: TypeScript with axios

## How It Works

1. **Categories are cached** — First load fetches from API and caches for 1 hour
2. **Select a category** on the dashboard
3. **Click "Reload Data"** to fetch auctions from the API
4. **Data is stored in SQLite** and persists between page refreshes
5. **Table auto-updates** with the new auction data

## Dashboard Features

- Category selector dropdown
- "Reload Data" button for manual refresh
- Live table with auctions
- Status badges (color-coded: Verified, Cancelled, Completed, Unverified)
- Last-updated timestamp
- Auction count stats
- Responsive mobile-friendly design
- Error handling with clear messages

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Serve dashboard HTML |
| `GET` | `/api/categories` | All leaf-level categories (cached) |
| `GET` | `/api/auctions?categoryId=7` | Stored auctions from database |
| `POST` | `/api/auctions/reload` | Fetch from API → store in DB → return rows |

### Reload Endpoint Example

```bash
curl -X POST http://localhost:3000/api/auctions/reload \
  -H 'Content-Type: application/json' \
  -d '{"categoryId":"7","itemCount":24,"pageCount":"1"}'
```

Response:
```json
{
  "success": true,
  "count": 24,
  "lastSync": "2026-04-14T12:28:03.611Z",
  "auctions": [...]
}
```

## TypeScript API Client Usage

For programmatic access (no web server needed):

```typescript
import { EAukcija } from './src';

const client = new EAukcija();

// Get all categories
const categories = await client.getCategories();

// Get auctions by category
const auctions = await client.getAuctionsByCategory('7', 12, '1');

// Find specific category
const category = await client.getCategoryById('7');

// Get leaf-only categories
const leaves = await client.getLeafCategories();
```

## Database Schema

**auctions table:**
```sql
CREATE TABLE auctions (
  id INTEGER PRIMARY KEY,           -- Auction.Id
  auction_number TEXT,
  start_date TEXT,
  end_date TEXT,
  starting_price REAL,
  current_price REAL,
  max_offered_price REAL,
  short_description TEXT,
  status TEXT,
  status_translation TEXT,
  number_of_verified_users INTEGER,
  is_first_sale INTEGER,            -- Boolean as 0/1
  property_type TEXT,
  category_id TEXT,
  fetched_at TEXT                   -- ISO timestamp
);
```

**sync_log table:**
```sql
CREATE TABLE sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id TEXT,
  item_count INTEGER,
  page_count TEXT,
  fetched_at TEXT,
  auction_count INTEGER
);
```

Note: Thumbnails are excluded from DB (large base64 blobs, not needed for display).

## Project Structure

```
eaukcije/
├── src/
│   ├── client.ts         # EAukcija API client (TypeScript)
│   ├── types.ts          # TypeScript interfaces
│   ├── db.ts             # SQLite wrapper & queries
│   ├── server.ts         # Express server + API routes
│   └── index.ts          # Exports
├── public/
│   └── index.html        # Dashboard UI (single file)
├── data/
│   └── aukcije.db        # SQLite database (auto-created)
├── dist/                 # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── README.md
```

## npm Scripts

```bash
npm install              # Install dependencies
npm run build            # Build TypeScript → dist/
npm run dev              # Start dev server with ts-node
npm start                # Run compiled JS (production)
npm test                 # Run tests (if configured)
```

## Production Build

```bash
npm run build
npm start
```

Server listens on port 3000. Change it with environment variable:
```bash
PORT=8080 npm start
```

## Category IDs Reference

| ID | Category | Type |
|----|----------|------|
| 4 | Vehicles | Movable |
| 26 | Furniture | Movable |
| 91 | Machinery | Movable |
| 92 | Equipment | Movable |
| 93 | Tools | Movable |
| 94 | Animals | Movable |
| 95 | Art & Valuables | Movable |
| 96 | Materials | Movable |
| 97 | Goods | Movable |
| 98 | Other Movable | Movable |
| 47 | Land Parcels | Immovable |
| 48 | Buildings | Immovable |
| 49 | Building Units | Immovable |

## Example Usage

### Fetch and store auctions
```bash
curl -X POST http://localhost:3000/api/auctions/reload \
  -H 'Content-Type: application/json' \
  -d '{"categoryId":"7","itemCount":24}'
```

### Get all categories
```bash
curl http://localhost:3000/api/categories | jq '.[] | .title'
```

### Query database directly
```bash
sqlite3 data/aukcije.db "SELECT COUNT(*) FROM auctions;"
sqlite3 data/aukcije.db "SELECT auction_number, short_description FROM auctions LIMIT 5;"
```

## TypeScript Interfaces

```typescript
interface Auction {
  Id: number;
  AuctionNumber: string;
  StartDate: string;                    // ISO 8601
  EndDate: string;
  MaxOfferedPrice: number | null;
  CurrentPrice: number | null;
  StartingPrice: number;
  ShortDescription: string;             // In Serbian
  Status: AuctionStatus;
  StatusTranslation: string;
  NumberOfVerifiedUsers: number;
  IsFirstSale: boolean;
  PropertyType: PropertyType;
  Thumbnail: string;                    // Base64 (empty from DB)
  ThumbnailType: string;
}

type AuctionStatus = 'Verified' | 'Unverified' | 'Cancelled' | 'Completed';
type PropertyType = 'MovableProperties' | 'ImmovableProperties' | 'CommonProperties';

interface Category {
  title: string;
  value: string;
  key: string;
  categoryType: CategoryType;
  children: Category[];
}

type CategoryType = 'MovableProperties' | 'ImmovableProperties' | 'CommonProperties';
```

## Notes

- **Data Persistence**: All auctions are stored in SQLite, not in memory. Survives server restarts.
- **Category Caching**: Categories are fetched once and cached for 1 hour to reduce API calls.
- **Thumbnails**: Excluded from database (stored as large base64 strings). Not needed for the table view.
- **Timestamps**: All auctions are timestamped when fetched (ISO 8601 format).
- **No External Dependencies**: Dashboard works without any npm packages (vanilla JS/CSS/HTML).

## License

MIT
