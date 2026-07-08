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
│   │   ├── main.ts                 # Bootstrap (NestFactory, cookie-parser, body-parser limit)
│   │   ├── app.module.ts           # Root module — imports all feature modules, global JwtAuthGuard
│   │   ├── app.controller.ts       # GET /health (@Public)
│   │   ├── database/
│   │   │   ├── database.module.ts
│   │   │   └── database.service.ts # pg Pool init & schema (OnModuleInit)
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.service.ts        # login, JWT sign/verify, change-password, seeds default admin
│   │   │   ├── auth.controller.ts     # POST /api/auth/login|logout|change-password, GET /api/auth/me
│   │   │   ├── users.service.ts       # admin user management (list/create/delete)
│   │   │   ├── users.controller.ts    # /api/users (admin only)
│   │   │   ├── jwt-auth.guard.ts      # global guard — verifies `token` cookie, sets req.user
│   │   │   ├── admin.guard.ts         # per-route guard — requires req.user.role === 'admin'
│   │   │   └── public.decorator.ts    # @Public() to bypass JwtAuthGuard
│   │   ├── eaukcija/
│   │   │   ├── eaukcija.module.ts
│   │   │   └── eaukcija.service.ts # HTTPS client for eaukcija.sud.rs API
│   │   ├── auctions/
│   │   │   ├── auctions.module.ts
│   │   │   ├── auctions.controller.ts # GET open to any logged-in user; DELETE admin-only
│   │   │   └── auctions.service.ts
│   │   ├── refresh/
│   │   │   ├── refresh.module.ts
│   │   │   ├── refresh.controller.ts  # POST /api/refresh (SSE streaming, admin-only)
│   │   │   └── refresh.service.ts     # Core refresh logic (fetch + enrich + upsert)
│   │   ├── ai-filter/
│   │   │   ├── ai-filter.module.ts
│   │   │   ├── ai-filter.controller.ts # admin-only
│   │   │   └── ai-filter.service.ts
│   │   ├── scheduler/
│   │   │   ├── scheduler.module.ts
│   │   │   └── scheduler.service.ts   # @Cron jobs at 00:00 & 12:00
│   │   └── utils/
│   │       └── utils.ts               # Cyrillic-to-Latin helpers
│   └── dist/                       # Compiled JS output (gitignored)
├── frontend/
│   ├── index.html                  # Main UI (vanilla JS) — requires login, role-gated controls
│   ├── login.html                  # Login page
│   └── admin.html                  # User management page (admin only)
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
| `JWT_SECRET` | Yes | Secret used to sign/verify login session JWTs. App refuses to start without it. |

---

## Authentication & authorization

- Every `/api/*` route requires a logged-in session except `POST /api/auth/login` and `GET /health` (marked `@Public()`).
- Sessions are a JWT (7-day expiry) stored in an **httpOnly** cookie named `token`, set on login. `JwtAuthGuard` (global, via `APP_GUARD`) verifies it on every request and attaches `req.user = { sub, username, role }`.
- Two roles: `admin` and `user`. `AdminGuard` is applied per-controller/route to restrict admin-only actions.
- **Regular users** can only view auction data (`GET /api/auctions`) and change their own password. They cannot trigger a refresh, delete the database, use the AI filter, or manage users — those routes reject them with `403`.
- A default admin account (`admin` / `ProxmoxGuru123`) is seeded automatically on first boot (`AuthService.onModuleInit`) if no `admin` user exists yet. Change the password after first login via `POST /api/auth/change-password`.
- Admins manage regular user accounts (create/list/delete) via `/api/users`. Users cannot delete their own account, and the seeded `admin` account cannot be deleted via the UI (no delete button rendered for `role: admin`).

---

## API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/health` | Public | Health check |
| `POST` | `/api/auth/login` | Public | `{username, password}` → sets `token` cookie, returns `{user}` |
| `POST` | `/api/auth/logout` | Logged in | Clears the session cookie |
| `GET` | `/api/auth/me` | Logged in | Returns `{user: {username, role}}` for the current session |
| `POST` | `/api/auth/change-password` | Logged in | `{oldPassword, newPassword}` — self-service password change (used for the admin's initial password too) |
| `GET` | `/api/users` | Admin | List all user accounts |
| `POST` | `/api/users` | Admin | `{username, password}` — create a regular (`role: user`) account |
| `DELETE` | `/api/users/:id` | Admin | Delete a user account (not self) |
| `GET` | `/api/auctions` | Logged in | All auctions + last refresh timestamp |
| `DELETE` | `/api/auctions` | Admin + `DB_REMOVE_PASSWORD` in body | Wipe all auction data |
| `POST` | `/api/refresh` | Admin | Fetch fresh data from eaukcija.sud.rs; streams SSE progress |
| `POST` | `/api/ai-filter` | Admin | Natural language filter via Gemini 2.5 Flash |

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

**`meta`** — key/value store; currently only `last_refresh` (ISO 8601 string).

**`users`**

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PK | |
| `username` | TEXT UNIQUE NOT NULL | |
| `password_hash` | TEXT NOT NULL | bcrypt hash (`bcryptjs`, 10 rounds) |
| `role` | TEXT NOT NULL DEFAULT `'user'` | `'admin'` or `'user'` |
| `created_at` | TIMESTAMPTZ | `NOW()` at insert |

---

## Frontend architecture

`frontend/index.html`, `frontend/login.html`, and `frontend/admin.html` are self-contained files with no build tooling (each ships its own inline `<style>`/`<script>`).

- `login.html` — login form; posts to `/api/auth/login`, redirects to `/` on success. If already logged in (checked via `/api/auth/me`), redirects to `/` immediately.
- `admin.html` — user management (admin only). Redirects non-admins to `/`, unauthenticated visitors to `/login.html`. Lists users, creates regular accounts, deletes them.
- `index.html` — on load, calls `GET /api/auth/me`; redirects to `/login.html` if unauthenticated. `applyRoleUI()` hides `#refreshBtn`, `#clearBtn`, `#aiFilterPanel`, and `#usersLink` unless `role === 'admin'`. Header also exposes a "Lozinka" (change password) modal and a logout button, available to every logged-in user.

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
| `currentUser` | `{username, role}` for the logged-in session, set by `checkAuth()` |

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
# Edit .env — set DB_REMOVE_PASSWORD, GEMINI_API_KEY, DATABASE_URL, JWT_SECRET

npm install
npm run dev        # ts-node backend/src/main.ts
# open http://localhost:3000 — log in as admin / ProxmoxGuru123, then change the password
```

A local PostgreSQL instance must be reachable at the `DATABASE_URL` you configure.

## Running with Docker

```bash
cp .env.example .env
# Edit .env — set DB_REMOVE_PASSWORD, GEMINI_API_KEY, POSTGRES_PASSWORD, JWT_SECRET

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

## External API

- **Host:** `eaukcija.sud.rs`
- **Endpoint used:** `POST /WebApi.Proxy/api/EAukcija/GetAuctionsByCategoryId` (category `7`, pageSize 500)
- **Detail endpoint:** `POST /WebApi.Proxy/api/EAukcija/GetImmovablePropertyDetails`
- Client is in `backend/src/eaukcija/eaukcija.service.ts`; no auth required.
