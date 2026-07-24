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
| Scheduler | `@nestjs/schedule` (`SchedulerRegistry` + dynamic `CronJob`) — admin-configurable via `/api/scheduler/settings`, applied live without a restart; default twice daily (00:00/12:00 Europe/Belgrade), persisted in `meta` |
| Frontend | React 18 + TypeScript, built with Vite; `react-router-dom` `HashRouter` for client-side routing (`/`, `/admin`) |
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
│   │   ├── favorites/
│   │   │   ├── favorites.module.ts
│   │   │   ├── favorites.controller.ts # GET/POST/DELETE — any logged-in user, own favorites only
│   │   │   └── favorites.service.ts
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
│   │   │   ├── scheduler.service.ts   # Dynamic CronJob via SchedulerRegistry; schedule persisted in `meta`
│   │   │   └── schedule-settings.controller.ts # GET/PUT /api/scheduler/settings, admin-only
│   │   └── utils/
│   │       └── utils.ts               # Cyrillic-to-Latin helpers
│   └── dist/                       # Compiled JS output (gitignored)
├── frontend/                       # React + TypeScript SPA, built with Vite (own package.json)
│   ├── index.html                  # Vite entry HTML (mounts #root)
│   ├── vite.config.ts              # Dev server proxies /api and /health to :3000; build → frontend/dist
│   ├── dist/                       # Production build output (gitignored) — served by NestJS ServeStaticModule
│   └── src/
│       ├── main.tsx                 # ReactDOM root, HashRouter + AuthProvider
│       ├── App.tsx                  # App loader → LoginScreen or Shell, based on auth state
│       ├── api.ts                   # fetch wrappers for every backend endpoint
│       ├── types.ts                 # Auction / UserAccount / ScheduleSettings / RefreshEvent types
│       ├── utils.ts                 # Cyrillic-to-Latin, diacritic stripping, date/price formatting
│       ├── filtering.ts             # Pure applyFilters/sortData/withFavoritesFirst helpers
│       ├── styles.css               # Global stylesheet (ported 1:1 from the old single-file app)
│       ├── context/
│       │   ├── AuthContext.tsx          # currentUser, login/logout, GET /api/auth/me on mount
│       │   ├── MessageContext.tsx       # top-of-page alert banner (error/success/info)
│       │   └── AuctionsDataContext.tsx  # allAuctions/favoriteIds/lastRefresh + SSE refresh + clear-db
│       └── components/
│           ├── AppLoader.tsx, LoginScreen.tsx, Shell.tsx, Header.tsx
│           ├── AuctionsView.tsx, StatsRow.tsx, ProgressBar.tsx, FiltersPanel.tsx,
│           │   AiFilterPanel.tsx, AuctionsTable.tsx, Pagination.tsx
│           ├── AdminView.tsx               # user management (create/list/delete)
│           └── Modal.tsx, DeleteDbModal.tsx, ChangePasswordModal.tsx,
│               ScheduleModal.tsx, DeleteUserModal.tsx
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
| `ADMIN_DEFAULT_PASSWORD` | No | Password used for the seeded default `admin` account on first boot (only takes effect if no `admin` user exists yet). Falls back to `changeme` if unset — always set this in any non-throwaway deployment and change it via `POST /api/auth/change-password` after first login regardless. |

---

## Authentication & authorization

- Every `/api/*` route requires a logged-in session except `POST /api/auth/login` and `GET /health` (marked `@Public()`).
- Sessions are a JWT (7-day expiry) stored in an **httpOnly** cookie named `token`, set on login. `JwtAuthGuard` (global, via `APP_GUARD`) verifies it on every request and attaches `req.user = { sub, username, role }`.
- Two roles: `admin` and `user`. `AdminGuard` is applied per-controller/route to restrict admin-only actions.
- **Regular users** can only view auction data (`GET /api/auctions`) and change their own password. They cannot trigger a refresh, delete the database, use the AI filter, or manage users — those routes reject them with `403`.
- A default admin account (username `admin`, password from `ADMIN_DEFAULT_PASSWORD`, falling back to `changeme` if unset) is seeded automatically on first boot (`AuthService.onModuleInit`) if no `admin` user exists yet. Change the password after first login via `POST /api/auth/change-password`.
- Admins manage regular user accounts (create/list/delete) via `/api/users`. Users cannot delete their own account, and the seeded `admin` account cannot be deleted via the UI (no delete button rendered for `role: admin`).
- **Favorites** are personal, not admin-gated: any logged-in user (admin or regular) can star/unstar auctions via `/api/favorites`. Each user only ever sees and mutates their own favorites (scoped by `req.user.sub`).

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
| `GET` | `/api/favorites` | Logged in | Array of auction IDs the current user has favorited |
| `POST` | `/api/favorites/:auctionId` | Logged in | Add an auction to the current user's favorites |
| `DELETE` | `/api/favorites/:auctionId` | Logged in | Remove an auction from the current user's favorites |
| `POST` | `/api/refresh` | Admin | Fetch fresh data from eaukcija.sud.rs; streams SSE progress |
| `POST` | `/api/refresh/:id` | Admin | Refresh a single auction from `GetImmovablePropertyDetails`; returns the updated row as JSON |
| `GET` | `/api/scheduler/settings` | Admin | Current auto-refresh schedule, available presets, and next scheduled run |
| `PUT` | `/api/scheduler/settings` | Admin | `{preset, cron?}` — update the auto-refresh schedule; applies live, no restart |
| `POST` | `/api/ai-filter` | Admin | Natural language filter via Gemini 2.5 Flash |

### `GET` / `PUT /api/scheduler/settings`

`GET` response:
```json
{
  "presets": [
    { "id": "every_6h", "label": "Svakih 6 sati", "cron": "0 */6 * * *" },
    { "id": "every_12h", "label": "Svakih 12 sati (podrazumevano)", "cron": "0 0,12 * * *" },
    { "id": "daily_midnight", "label": "Jednom dnevno u ponoć", "cron": "0 0 * * *" },
    { "id": "custom", "label": "Prilagođeno (cron izraz)", "cron": null }
  ],
  "current": { "preset": "every_12h", "cron": "0 0,12 * * *", "timezone": "Europe/Belgrade", "nextRun": "2026-07-23T12:00:00+02:00" }
}
```

`PUT` request body — either `{ "preset": "every_6h" }` or, for a custom schedule, `{ "preset": "custom", "cron": "*/30 * * * *" }`. Response mirrors `current` above. Invalid preset id / missing custom cron / unparseable cron expression → `400`. The schedule is stored in `meta` (`refresh_schedule_preset`, `refresh_schedule_cron`) and applied immediately via `SchedulerRegistry` — no server restart needed, and it persists across restarts.

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
| `current_price` | REAL | Extracted from the API's `CurrentPrice` field (bulk refresh, per-row refresh, and new-auction inserts). Nullable — some auctions have no current price yet. |
| `start_date` | TEXT | ISO 8601 |
| `end_date` | TEXT | ISO 8601 |
| `property_type` | TEXT | |
| `is_first_sale` | INTEGER | 0 or 1 |
| `details_fetched` | INTEGER | 0 or 1 — whether detail API was called |
| `raw_data` | TEXT | Full JSON blob; excluded from `/api/auctions` response |
| `added_at` | TIMESTAMPTZ | `NOW()` at insert |

**`meta`** — key/value store: `last_refresh` (ISO 8601 string), `refresh_schedule_preset` (preset id, see `SCHEDULE_PRESETS` in `scheduler.service.ts`), `refresh_schedule_cron` (the resolved cron expression currently installed for the auto-refresh job).

**`favorites`**

| Column | Type | Notes |
|---|---|---|
| `user_id` | INTEGER | FK → `users(id)` ON DELETE CASCADE; part of composite PK |
| `auction_id` | TEXT | FK → `auctions(id)` ON DELETE CASCADE; part of composite PK |
| `created_at` | TIMESTAMPTZ | `NOW()` at insert |

Composite primary key `(user_id, auction_id)` — one row per user/auction favorite. Cascades clean up automatically when a user or auction is deleted (including a full `DELETE /api/auctions` wipe).

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

`frontend/` is a React 18 + TypeScript single-page app built with Vite (its own `package.json`, separate from the root one). In production, the compiled static bundle (`frontend/dist/`) is served by NestJS's `ServeStaticModule` from the same origin as the API — there is no separate frontend server in production. In development, run `npm run dev:frontend` (Vite dev server, default port 5173) alongside `npm run dev` (backend on `:3000`); `vite.config.ts` proxies `/api` and `/health` to `:3000` so the app works identically to production.

**Screens** (mutually exclusive, driven by React state/routes, not manual DOM show/hide):

| Component | Shown when |
|---|---|
| `AppLoader` | Always mounted first; fades out once the initial `GET /api/auth/me` check resolves |
| `LoginScreen` | No valid session (`currentUser === null`) |
| `Shell` | Logged in — renders `Header` + the routed view below |
| `Shell` → `AuctionsView` | Main auctions table/filters/AI panel, route `/` (`#/`) |
| `Shell` → `AdminView` | User management, admin only, route `/admin` (`#/admin`) |

**Router:** `react-router-dom`'s `HashRouter` (mounted in `main.tsx`) provides `/` and `/admin` routes; `Shell.tsx` redirects `/admin` back to `/` for non-admin users via `<Navigate>`. There's no manual fade-transition queue anymore — React's own reconciliation handles view swaps.

**State management — React Context, no global mutable variables:**

| Context | Provides |
|---|---|
| `AuthContext` | `currentUser`, `loading`, `login()`, `logout()` — resolves `GET /api/auth/me` once on mount |
| `MessageContext` | Top-of-page alert banner (`error`/`success`/`info`), auto-dismissed after 8s except errors |
| `AuctionsDataContext` | `allAuctions`, `favoriteIds`, `lastRefresh`, `loaded`/`ensureLoaded()` (lazy first load, mirrors the old `auctionsLoaded` guard), `toggleFavorite()`, `clearDatabase()`, `refreshingIds`/`refreshAuction()` (per-row refresh), and the refresh SSE state/`doRefresh()` — mounted once per login session so `Header`'s refresh/clear-db actions and `AuctionsView`'s table share the same data regardless of which route is active |

Per-view UI state (search text, sort column/direction, pagination, AI filter query) lives as local `useState` inside `AuctionsView`/`AdminView`, not in a context — it doesn't need to survive a route change since it's re-derived on mount.

**Header submenu:** Osveži, Korisnici, Podešavanja osvežavanja, Promeni lozinku, Obriši bazu, and Odjava are collapsed into a single dropdown in `Header.tsx`, closed on outside click/Escape/item click. Admin-only items are conditionally rendered (not just hidden) based on `currentUser.role === 'admin'`.

**Modals:** `Modal.tsx` is a thin wrapper around the native `<dialog>` element (`showModal()`/`close()` via a ref + `useEffect`) used by `DeleteDbModal`, `ChangePasswordModal`, `ScheduleModal`, and `DeleteUserModal`. Each modal owns its own form state and is only mounted while open (conditional render), so no reset-on-close logic is needed.

**Auto-refresh schedule modal:** `ScheduleModal` fetches `GET /api/scheduler/settings` on mount, renders a preset `<select>` and next-scheduled-run time; picking "Prilagođeno (cron izraz)" reveals a raw cron text input. Saving calls `PUT /api/scheduler/settings`.

**Filter pipeline** (`src/filtering.ts`, pure functions, memoized in `AuctionsView` via `useMemo`):

1. `applyFilters(allAuctions, filterState)` — text search, status, first sale, price range, show-finished toggle, and `aiMatchIds` set
2. `sortData(...)` — stable sort on the chosen column
3. `withFavoritesFirst(...)` — partitions the sorted result so favorited auctions (per `favoriteIds`) float to the front, each group keeping the chosen sort order internally
4. `AuctionsTable` slices for the current page and renders rows, inserting a "★ Favoriti" / "Sve aukcije" group-header row where the favorite/non-favorite groups meet within the visible page

**Favorites UI:** Each row has a star toggle button (leftmost column) that calls `toggleFavorite(id)` from `AuctionsDataContext` — optimistically flips `favoriteIds` and re-renders, then confirms with `POST`/`DELETE /api/favorites/:id`, reverting on failure. Favorited rows get a highlighted background (`.fav-row`).

**Cyrillic handling:** All text is stored as Cyrillic in the DB. `transformAuction()` (`utils.ts`) converts every text field to Serbian Latin at load time using `cyrToLat()`. Search also strips diacritics via `stripDiacritics()` so e.g. `"kuca"` matches `"kuća"`.

**Refresh via SSE:** `AuctionsDataContext.doRefresh()` calls `POST /api/refresh` and reads the response body as a stream of `data: {...}\n\n` events with types `status`, `progress`, `done`, `error`, updating progress-bar state as they arrive.

**Per-row refresh (concluded auctions):** The bulk refresh only sees auctions still returned by `GetAuctionsByCategoryId` — once an auction concludes on eaukcija.sud.rs it drops out of that listing entirely, so its final status/price stop being picked up by `runRefresh()`. Each row's `col-fav` cell has a small ⟳ button (`AuctionsTable`, admin only, next to the favorite star) that calls `AuctionsDataContext.refreshAuction(id)` → `POST /api/refresh/:id` → `RefreshService.refreshOne()`, which calls `GetImmovablePropertyDetails` directly (keyed by ID, works regardless of category-listing state) and updates whichever columns the response actually contains — it doesn't overwrite a column with a blank/undefined value, since the exact field shape for concluded auctions isn't confirmed yet. `refreshingIds` (a `Set<string>`) tracks in-flight per-row requests so the button disables/spins only for the row being refreshed. On success the returned row is merged into `allAuctions` in place — no full `/api/auctions` reload and no pagination reset, since `AuctionsView`'s `page` state only resets on filter/sort changes, not on `allAuctions` updates.

---

## Running locally

```bash
cp .env.example .env
# Edit .env — set DB_REMOVE_PASSWORD, GEMINI_API_KEY, DATABASE_URL, JWT_SECRET, ADMIN_DEFAULT_PASSWORD

npm install
npm run dev             # backend: ts-node backend/src/main.ts (port 3000)
npm run dev:frontend    # in a second terminal: Vite dev server (proxies /api to :3000)
# open the Vite dev server URL it prints (default http://localhost:5173)
# log in as admin / <your ADMIN_DEFAULT_PASSWORD>, then change the password
```

A local PostgreSQL instance must be reachable at the `DATABASE_URL` you configure. To exercise the production setup (single origin, no Vite dev server), run `npm run build` then `npm start` and open `http://localhost:3000` directly.

## Running with Docker

```bash
cp .env.example .env
# Edit .env — set DB_REMOVE_PASSWORD, GEMINI_API_KEY, POSTGRES_PASSWORD, JWT_SECRET, ADMIN_DEFAULT_PASSWORD

docker compose up --build
# open http://localhost:3000
# PostgreSQL data persists in the 'pgdata' Docker volume
```

## Building for production

```bash
npm run build       # tsc → backend/dist/, then builds frontend/dist/ (Vite)
node backend/dist/main.js
```

`npm run build` runs `build:backend` (`tsc`) and `build:frontend` (`npm --prefix frontend install && npm --prefix frontend run build`); the compiled server serves the static React bundle from `frontend/dist/` via `ServeStaticModule` (see `backend/src/app.module.ts`).

---

## Testing

```bash
npm test
```

`test/app.test.js` boots the real `AppModule` via `@nestjs/testing` and exercises the actual guarded routes (`GET /health`, auth guard 401s, `/api/auctions`, `/api/favorites`, `/api/ai-filter` validation, `DELETE /api/auctions` password checks) with `supertest`. It probes `DATABASE_URL` reachability with a plain `pg` query before touching the app; if that fails, every test calls `t.skip()` at run time (checked dynamically, not via node:test's static `skip` option, since that's evaluated before the async check in `before()` can resolve) and the run reports skipped rather than failed. If the DB *is* reachable, any further setup failure (bad bootstrap, broken login) throws and fails the suite for real, instead of being folded into the same "DB unavailable" skip. Tests authenticate as a dedicated `__e2e_test_admin__` account provisioned (upserted with a known password, then deleted in `after()`) directly via `DatabaseService` — not the seeded default `admin` account, whose password may have been changed or seeded differently on a pre-existing database.

---

## Continuous integration

`.circleci/config.yml` defines a single `build-and-test` job/workflow that runs on every push: a `cimg/node:lts` container plus a `cimg/postgres:16.11` service container (credentials `eaukcije`/`eaukcije`, db `eaukcije`), which installs backend and frontend dependencies (cached by lockfile checksum), builds both (`npm run build:backend`, `npm --prefix frontend run build`), waits for Postgres via the preinstalled `dockerize -wait tcp://localhost:5432`, then runs `npm test`. `DATABASE_URL`, `JWT_SECRET`, `DB_REMOVE_PASSWORD`, and `ADMIN_DEFAULT_PASSWORD` are set as throwaway values on the primary container — none of them need to match anything outside CI, since the test suite provisions its own dedicated test admin account regardless of what's seeded.

---

## External API

- **Host:** `eaukcija.sud.rs`
- **Endpoint used:** `POST /WebApi.Proxy/api/EAukcija/GetAuctionsByCategoryId` (category `7`, pageSize 500)
- **Detail endpoint:** `POST /WebApi.Proxy/api/EAukcija/GetImmovablePropertyDetails`
- Client is in `backend/src/eaukcija/eaukcija.service.ts`; no auth required.
