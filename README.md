# Stock Portfolio Tracker

A full-stack **multi-user social** portfolio tracker built with **Next.js (App
Router)** and **Tailwind CSS**. Each user signs in (**Clerk**), builds a portfolio
saved to **PostgreSQL via Prisma**, and can browse other members' **public
profiles**. Live prices, real-time P&L, interactive charts (**Recharts**), and a
dual **micro / macro** news feed round it out. All secrets stay server-side.

## Features

- **Authentication** — email/social sign-in via Clerk; a local `User` row is
  mirrored from Clerk on first visit so positions and profiles can reference it.
- **Personal portfolio (DB-backed)** — add/remove stocks with shares + buy price;
  total value and real-time P&L per position and portfolio-wide. Adding an
  existing ticker merges into a weighted-average cost position. Positions are
  **saved to PostgreSQL** and follow the user across devices (no more
  `localStorage`).
- **Social directory** — a sidebar list of other investors, linking to their
  public profiles.
- **Public profiles** — `/profile/[userId]`: a read-only view of any user's
  holdings, total value, and the micro news for their tickers.
- **Live prices** — auto-refreshing polling of a server route that proxies
  Finnhub (or Polygon). Polling pauses when the tab is hidden to conserve
  free-tier calls. A WebSocket streaming path is documented in
  `src/hooks/useLivePrices.ts`.
- **Micro vs. macro news**
  - _Micro_: company-specific headlines filtered **strictly** to the tickers you hold.
  - _Macro_: market-wide economy, Federal Reserve, and sector-trend news.
- **Data visualization** — interactive **allocation** (donut) and **historical
  performance** (area) charts via Recharts, with selectable 1M/3M/6M/1Y ranges.
- **Secure config** — all provider calls run in API route handlers; the key is
  read from `.env.local` and never shipped to the browser.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Create your env file and fill in the keys (see "Setup" below)
cp .env.local.example .env.local

# 3. Push the Prisma schema to your database (creates the tables)
npm run db:push

# 4. Run the dev server
npm run dev
# open http://localhost:3000
```

## Setup — getting your keys

You need three things in `.env.local`: a **database**, **Clerk auth keys**, and a
**Finnhub key**. All are free.

### 1. Database — Neon or Supabase (PostgreSQL)

**Option A — Neon (fastest):**
1. Sign up at <https://neon.tech> and create a project.
2. On the project dashboard open **Connection Details**.
3. Copy the **Pooled connection** string → `DATABASE_URL`.
4. Toggle to the **Direct connection** string → `DIRECT_URL`.

**Option B — Supabase:**
1. Create a project at <https://supabase.com>.
2. Go to **Project Settings → Database → Connection string → URI**.
3. `DATABASE_URL` = the **Transaction pooler** URI (port `6543`); append
   `?pgbouncer=true&sslmode=require`.
4. `DIRECT_URL` = the **Session / direct** URI (port `5432`); append
   `?sslmode=require`.
5. Replace `[YOUR-PASSWORD]` in both with your DB password.

Then create the tables:
```bash
npm run db:push        # or: npx prisma migrate dev --name init
npm run db:studio      # optional: browse your data
```

### 2. Authentication — Clerk

1. Create a free application at <https://dashboard.clerk.com>.
2. Choose the sign-in methods you want (email, Google, etc.).
3. Open **API Keys** and copy:
   - **Publishable key** → `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - **Secret key** → `CLERK_SECRET_KEY`

### 3. Market data — Finnhub

- Register at <https://finnhub.io/register> (free: 60 calls/min; covers quotes,
  company news, market news, symbol search) → `FINNHUB_API_KEY`.
- Historical candles come from `yahoo-finance2` (no key). Polygon is an optional
  alternative for quotes/history (`PRICE_PROVIDER=polygon`, `POLYGON_API_KEY`).

## Architecture

```
prisma/
└── schema.prisma                  # User + Position models (PostgreSQL)
src/
├── middleware.ts                  # Clerk middleware (enables auth())
├── app/
│   ├── layout.tsx                 # ClerkProvider + NavBar + global styles
│   ├── page.tsx                   # Auth-gated home: landing OR dashboard
│   ├── profile/[userId]/page.tsx  # Public read-only profile (server)
│   ├── globals.css                # Tailwind layers + theme tweaks
│   └── api/                       # Secure server route handlers (secrets stay here)
│       ├── positions/route.ts     # GET list / POST add (DB, per-user)
│       ├── positions/[id]/route.ts# DELETE / PATCH a position
│       ├── quote/route.ts         # GET single or batch quotes
│       ├── news/company/route.ts  # GET micro (per-ticker) news
│       ├── news/market/route.ts   # GET macro (market-wide) news
│       ├── search/route.ts        # GET symbol autocomplete
│       └── history/route.ts       # POST aggregated portfolio value series
├── components/
│   ├── NavBar.tsx                 # Sign-in / UserButton (Clerk)
│   ├── PortfolioProvider.tsx      # Context backed by /api/positions (DB)
│   ├── Dashboard.tsx              # Composition root (client); takes directory slot
│   ├── UserDirectory.tsx          # Social directory (server component, queries DB)
│   ├── AddStockForm.tsx           # Add position + symbol search
│   ├── PortfolioSummary.tsx       # Value / cost / P&L / today stat cards
│   ├── HoldingsTable.tsx          # Per-position table with remove
│   ├── AllocationChart.tsx        # Recharts donut
│   ├── PerformanceChart.tsx       # Recharts area + range selector
│   └── NewsFeed.tsx               # Micro/macro tabbed feed
├── hooks/
│   ├── useLivePrices.ts           # Polling price subscription
│   └── usePortfolioMetrics.ts     # Derived per-position + total metrics
└── lib/
    ├── prisma.ts                  # Prisma client singleton
    ├── user.ts                    # getCurrentDbUser() — Clerk → DB sync
    ├── provider.ts                # server-only market-data abstraction
    ├── types.ts                   # Shared types
    └── format.ts                  # Currency / percent / time formatters
```

## Configuration reference

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `DATABASE_URL` | **yes** | — | Pooled PostgreSQL URL (Neon/Supabase) used at runtime |
| `DIRECT_URL` | **yes** | — | Direct PostgreSQL URL used by `prisma db push` / migrations |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | **yes** | — | Clerk publishable key (browser-safe) |
| `CLERK_SECRET_KEY` | **yes** | — | Clerk secret key (server only) |
| `FINNHUB_API_KEY` | yes (news; quotes unless using Polygon) | — | Free key from finnhub.io |
| `PRICE_PROVIDER` | no | `finnhub` | `finnhub` or `polygon` (affects quotes/history) |
| `POLYGON_API_KEY` | only if `PRICE_PROVIDER=polygon` | — | Free key from polygon.io |
| `NEXT_PUBLIC_PRICE_POLL_MS` | no | `15000` | Client poll interval (ms). Keep ≥ 15000 on free tiers. |

## Notes & limitations

- **Historical data**: Finnhub's `/stock/candle` endpoint now requires a paid
  plan on many accounts. When candles are unavailable the performance chart falls
  back to a deterministic synthetic series anchored on the live price so the UI
  still renders. Swap in Polygon aggregates or another source in
  `src/lib/provider.ts` (`getDailyCloses`) for production-accurate history.
- **Rate limits**: quote routes revalidate briefly so concurrent clients share
  upstream responses; the client also pauses polling on hidden tabs.
- **Persistence**: positions are stored in PostgreSQL, keyed to the signed-in
  user. A local `User` row is synced from Clerk on first visit (`src/lib/user.ts`).
  For production you may prefer a Clerk webhook to keep the mirror in sync on
  profile changes/deletions instead of the on-demand upsert.
- **Profiles are public**: `/profile/[userId]` is readable by anyone (even signed
  out) by design — it's the social surface. Add a visibility flag to `User` if you
  want private portfolios.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | `prisma generate` + production build |
| `npm run start` | Serve the production build |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Push the Prisma schema to the database |
| `npm run db:studio` | Open Prisma Studio to browse data |
