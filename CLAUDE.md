# CLAUDE.md — EAukcije

> **Keep this file up to date.** Whenever you add a feature, change the architecture, add an environment variable, or modify the data model, update the relevant section here before committing.

---

## What this project is

A full-stack web app that tracks Serbian court auctions of real estate from `eaukcija.sud.rs` (category 7 — immovable properties). It scrapes auction data on a schedule, persists it to PostgreSQL, and exposes a browser UI with filtering, sorting, pagination, and an AI-powered natural language filter.

---

## Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + NestJS 10 (TypeScript) |
| Database | PostgreSQL via `pg` (async Pool, raw queries) |
| Scheduler | `@nestjs/schedule` (Cron) — runs at 00:00 and 12:00 UTC daily |
| Frontend | Vanilla HTML/CSS/JS — single file, no build step |
| AI filter | Google Generative AI SDK — `gemini-2.5-flash` |
| Deployment | Docker + Docker Compose (multi-stage build) |

---

## Project layout

```
eaukcije/
├── backend/
│   ├── src/                        # NestJS TypeScript source
│   │   ├── main.ts                 # Bootstrap (NestFactory, body-parser limit)
│   │   ├── app.module.ts           # Root module — imports all feature modules
│   │   ├── app.controller.ts       # GET /health
│   │   ├── database/
│   │   │   ├── database.module.ts
│   │   │   └── database.service.ts # pg Pool init & schema (OnModuleInit)
│   │   ├── eaukcija/
│   │   │   ├── eaukcija.module.ts
│   │   │   └── eaukcija.service.ts # HTTPS client for eaukcija.sud.rs API
│   │   ├── auctions/
│   │   │   ├── auctions.module.ts
│   │   │   ├── auctions.controller.ts
│   │   │   └── auctions.service.ts
│   │   ├── refresh/
│   │   │   ├── refresh.module.ts
│   │   │   ├── refresh.controller.ts  # POST /api/refresh (SSE streaming)
│   │   │   └── refresh.service.ts     # Core refresh logic (fetch + enrich + upsert)
│   │   ├── ai-filter/
│   │   │   ├── ai-filter.module.ts
│   │   │   ├── ai-filter.controller.ts
│   │   │   └── ai-filter.service.ts
│   │   ├── scheduler/
│   │   │   ├── scheduler.module.ts
│   │   │   └── scheduler.service.ts   # @Cron jobs at 00:00 & 12:00
│   │   └── utils/
│   │       └── utils.ts               # Cyrillic-to-Latin helpers
│   └── dist/                       # Compiled JS output (gitignored)
├── frontend/
│   └── index.html                  # Entire UI (~1200 lines, vanilla JS)
├── package.json
├── tsconfig.json
├── docker-compose.yml
├── Dockerfile                      # Multi-stage: build (tsc) → production image
└── .env.example
```

---

## Environment variables

All variables live in `.env` (copy from `.env.example`):

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | HTTP port, default `3000` |
| `DB_REMOVE_PASSWORD` | Yes | Password for `DELETE /api/auctions` |
| `GEMINI_API_KEY` | Yes (for AI filter) | Google Gemini API key — used by `POST /api/ai-filter` |
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgres://user:pass@host:5432/db` |
| `POSTGRES_PASSWORD` | Docker only | Password injected into the `postgres` service in Docker Compose |
| `KOMORA_COURT` | No | Court area string sent to komoraizvrsitelja.rs search; defaults to Novi Sad area |
| `OLLAMA_URL` | No | Ollama base URL for PDF AI extraction, default `http://localhost:11434` |
| `OLLAMA_MODEL` | No | Ollama model for PDF extraction, default `llama3.2` |

---

## API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | — | Health check |
| `GET` | `/api/auctions` | — | All auctions + last refresh timestamp |
| `DELETE` | `/api/auctions` | `DB_REMOVE_PASSWORD` in body | Wipe all auction data |
| `POST` | `/api/refresh` | — | Fetch fresh data from eaukcija.sud.rs **and** komoraizvrsitelja.rs; streams SSE progress |
| `POST` | `/api/ai-filter` | — | Natural language filter via Gemini 2.5 Flash |

### `POST /api/ai-filter`

Request body:
```json
{
  "description": "kuća u Vojvodini ispod 5 miliona",
  "ids": ["abc123", "def456"]
}
```

Response:
```json
{ "matchingIds": ["abc123", "def456"] }
```

Uses `gemini-2.5-flash`. Frontend sends only auction IDs; backend fetches key fields from PostgreSQL (id, opis, mesto, cena_rsd, tip, prva_prodaja) before sending to keep token usage low.

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
| `added_at` | TIMESTAMPTZ | `NOW()` at insert |
| `source` | TEXT | `'court'` (eaukcija.sud.rs) or `'executor'` (komoraizvrsitelja.rs) |
| `pdf_url` | TEXT | URL to PDF for executor auctions; `NULL` for court auctions |

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

1. `applyFilters(allAuctions)` — applies text search, status, first sale, source (court/executor), price range, show-finished toggle, and `aiMatchIds` set
2. `sortData(...)` — stable sort on the chosen column
3. `renderTable()` — slices for current page and writes HTML

**Cyrillic handling:** All text is stored as Cyrillic in the DB. `transformAuction()` converts every text field to Serbian Latin at load time using `cyrToLat()`. Search also strips diacritics via `stripDiacritics()` so e.g. `"kuca"` matches `"kuća"`.

**Refresh via SSE:** `POST /api/refresh` returns a stream of `data: {...}\n\n` events with types `status`, `progress`, `done`, `error`.

---

## Running locally

```bash
cp .env.example .env
# Edit .env — set DB_REMOVE_PASSWORD, GEMINI_API_KEY, DATABASE_URL

npm install
npm run dev        # ts-node backend/src/main.ts
# open http://localhost:3000
```

A local PostgreSQL instance must be reachable at the `DATABASE_URL` you configure.

## Running with Docker

```bash
cp .env.example .env
# Edit .env — set DB_REMOVE_PASSWORD, GEMINI_API_KEY, POSTGRES_PASSWORD

docker compose up --build
# open http://localhost:3000
# PostgreSQL data persists in the 'pgdata' Docker volume
```

## Building for production

```bash
npm run build      # tsc → backend/dist/
node backend/dist/main.js
```

---

## External APIs

### eaukcija.sud.rs (court auctions)
- **Host:** `eaukcija.sud.rs`
- **Endpoint used:** `POST /WebApi.Proxy/api/EAukcija/GetAuctionsByCategoryId` (category `7`, pageSize 500)
- **Detail endpoint:** `POST /WebApi.Proxy/api/EAukcija/GetImmovablePropertyDetails`
- Client is in `backend/src/eaukcija/eaukcija.service.ts`; no auth required.

### komoraizvrsitelja.rs (executor auctions)
- **Host:** `www.komoraizvrsitelja.rs`
- **Search endpoint:** `POST /oglasna_tabla/search.php` with `application/x-www-form-urlencoded` body (`userCourtS=<court area>`)
- Filters PDF links where the filename contains `непокретности` (real estate)
- Downloads each PDF and extracts text with `pdf-parse`
- Sends PDF text to local **Ollama** (`OLLAMA_MODEL`, default `llama3.2`) via `/api/chat` with `format: json` to extract structured data: case number, description, place, date and price of the **last** public sale
- Falls back to regex extraction if Ollama is unavailable
- Stored with `source = 'executor'` and `pdf_url` pointing to the original PDF
- Client is in `backend/src/komora-izvrsitelja/komora-izvrsitelja.service.ts`
