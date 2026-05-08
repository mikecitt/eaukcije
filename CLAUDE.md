# CLAUDE.md — EAukcije

> **Keep this file up to date.** Whenever you add a feature, change the architecture, add an environment variable, or modify the data model, update the relevant section here before committing.

---

## What this project is

A full-stack web app that tracks Serbian court auctions of real estate from `eaukcija.sud.rs` (category 7 — immovable properties). It scrapes auction data on a schedule, persists it to SQLite, and exposes a browser UI with filtering, sorting, pagination, and an AI-powered natural language filter.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express 4 |
| Database | SQLite via `better-sqlite3` (synchronous) |
| Scheduler | `node-cron` — runs at 00:00 and 12:00 UTC daily |
| Frontend | Vanilla HTML/CSS/JS — single file, no build step |
| AI filter | Anthropic SDK — `claude-haiku-4-5-20251001` |
| Deployment | Docker + Docker Compose |

---

## Project layout

```
eaukcije/
├── backend/
│   ├── server.js              # Express entry point, mounts all routes
│   ├── db.js                  # SQLite init & schema
│   ├── scheduler.js           # node-cron jobs (00:00 & 12:00)
│   ├── eaukcija-client.js     # HTTPS client for eaukcija.sud.rs API
│   ├── utils.js               # Cyrillic-to-Latin helpers
│   ├── routes/
│   │   ├── auctions.js        # GET /api/auctions, DELETE /api/auctions
│   │   ├── refresh.js         # POST /api/refresh (SSE streaming)
│   │   └── ai-filter.js       # POST /api/ai-filter (Claude Haiku)
│   └── services/
│       └── refresh.js         # Core refresh logic (fetch + enrich + upsert)
├── frontend/
│   └── index.html             # Entire UI (~1200 lines, vanilla JS)
├── data/
│   └── aukcije.db             # SQLite database (auto-created, gitignored)
├── package.json
├── docker-compose.yml
├── Dockerfile
└── .env.example
```

---

## Environment variables

All variables live in `.env` (copy from `.env.example`):

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | HTTP port, default `3000` |
| `DB_REMOVE_PASSWORD` | Yes | Password for `DELETE /api/auctions` |
| `ANTHROPIC_API_KEY` | Yes (for AI filter) | Anthropic API key — used by `POST /api/ai-filter` |

---

## API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | — | Health check |
| `GET` | `/api/auctions` | — | All auctions + last refresh timestamp |
| `DELETE` | `/api/auctions` | `DB_REMOVE_PASSWORD` in body | Wipe all auction data |
| `POST` | `/api/refresh` | — | Fetch fresh data from eaukcija.sud.rs; streams SSE progress |
| `POST` | `/api/ai-filter` | — | Natural language filter via Claude Haiku |

### `POST /api/ai-filter`

Request body:
```json
{
  "description": "kuća u Vojvodini ispod 5 miliona",
  "auctions": [ /* array of auction objects from allAuctions */ ]
}
```

Response:
```json
{ "matchingIds": ["abc123", "def456"] }
```

Uses `claude-haiku-4-5-20251001`. Each auction is trimmed to key fields (id, opis, mesto, cena_rsd, tip, prva_prodaja) before sending to keep token usage low.

---

## Database schema

**`auctions`**

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | External auction ID |
| `auction_number` | TEXT | |
| `short_description` | TEXT | Stored in Cyrillic |
| `place_name` | TEXT | |
| `place_municipality` | TEXT | |
| `status` | TEXT | Cyrillic status from API |
| `status_translation` | TEXT | English translation |
| `starting_price` | REAL | |
| `start_date` | TEXT | ISO 8601 |
| `end_date` | TEXT | ISO 8601 |
| `property_type` | TEXT | |
| `is_first_sale` | INTEGER | 0 or 1 |
| `details_fetched` | INTEGER | 0 or 1 — whether detail API was called |
| `raw_data` | TEXT | Full JSON blob; excluded from `/api/auctions` response |
| `added_at` | TEXT | `datetime('now')` at insert |

**`meta`** — key/value store; currently only `last_refresh` (ISO 8601 string).

---

## Frontend architecture

`frontend/index.html` is intentionally a single self-contained file with no build tooling.

**Key state variables:**

| Variable | Description |
|---|---|
| `allAuctions` | Full dataset loaded from `/api/auctions` |
| `filteredAuctions` | Result of `applyFilters` + `sortData` |
| `aiMatchIds` | `null` when AI filter inactive; `Set<id>` when active |
| `sortCol` / `sortDir` | Current sort state |
| `page` / `perPage` | Pagination state |
| `busy` | Prevents concurrent refresh requests |
| `aiBusy` | Prevents concurrent AI filter requests |

**Filter pipeline** (`applyFilters → sortData → renderTable`):

1. `applyFilters(allAuctions)` — applies text search, status, first sale, price range, show-finished toggle, and `aiMatchIds` set
2. `sortData(...)` — stable sort on the chosen column
3. `renderTable()` — slices for current page and writes HTML

**Cyrillic handling:** All text is stored as Cyrillic in the DB. `transformAuction()` converts every text field to Serbian Latin at load time using `cyrToLat()`. Search also strips diacritics via `stripDiacritics()` so e.g. `"kuca"` matches `"kuća"`.

**Refresh via SSE:** `POST /api/refresh` returns a stream of `data: {...}\n\n` events with types `status`, `progress`, `done`, `error`.

---

## Running locally

```bash
cp .env.example .env
# Edit .env — set DB_REMOVE_PASSWORD and ANTHROPIC_API_KEY

npm install
npm run dev        # node --watch backend/server.js
# open http://localhost:3000
```

## Running with Docker

```bash
cp .env.example .env
# Edit .env

docker compose up --build
# open http://localhost:3000
# SQLite database persists in ./data/aukcije.db via volume mount
```

---

## External API

- **Host:** `eaukcija.sud.rs`
- **Endpoint used:** `POST /WebApi.Proxy/api/EAukcija/GetAuctionsByCategoryId` (category `7`, pageSize 500)
- **Detail endpoint:** `POST /WebApi.Proxy/api/EAukcija/GetImmovablePropertyDetails`
- Client is in `backend/eaukcija-client.js`; no auth required.
