# ARXIS Frontend

Next.js 15 + TypeScript + Tailwind CSS + Framer Motion frontend for the ARXIS execution intelligence platform.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS + Catppuccin Mocha palette |
| Animation | Framer Motion + GSAP |
| Charts | Recharts |
| State | Zustand |
| UI primitives | Radix UI + shadcn/ui |
| Fonts | Syne (display) + JetBrains Mono (data) |

---

## Pages

| Route | Page |
|---|---|
| `/` | Landing — hero animation + "How ARXIS Works" + Enter Terminal |
| `/configure` | Configure — stock search, liquidity panel, universe grid, params |
| `/overview` | Strategy Overview — summary cards + AC vs RL chart |
| `/schedule` | Execution Schedule — intraday curve + session table |
| `/risk` | Risk Analysis — cost distributions + stress tests |
| `/regime` | Regime Monitor — HMM analysis + transition matrix |
| `/monitor` | Live Execution Monitor — progress ring + agent feed |
| `/report` | Post-Execution Report — slippage attribution + SEBI |

---

## Setup

### 1. Install dependencies

```bash
cd arxis-frontend
npm install
```

### 2. Configure backend URL

Edit `.env.local`:
```env
# Local development
BACKEND_URL=http://localhost:8000

# Production (Railway)
BACKEND_URL=https://your-arxis-backend.railway.app
```

### 3. Run development server

```bash
# Make sure backend is running first:
# cd arxis-backend && uvicorn main:app --reload --port 8000

npm run dev
```

Frontend available at: http://localhost:3000

---

## How API calls work

Next.js rewrites in `next.config.ts` proxy all `/api/*` requests to the backend URL — so the frontend always calls `/api/v1/...` and Next.js forwards it to FastAPI. No CORS issues on Railway (same platform).

```
Browser → /api/v1/execution/generate
       → Next.js rewrite
       → http://localhost:8000/api/v1/execution/generate
```

All API calls are in `src/lib/api.ts`. All TypeScript types are in `src/types/index.ts`.

---

## State management

Zustand store in `src/store/execution.ts` holds:
- `selectedStock` — StockProfile from `/stocks/{ticker}/profile`
- `executionResult` — GenerateResponse from `/execution/generate`
- `executionId` — used to fetch schedule, risk, report
- `scheduleData`, `riskData`, `regimeData`, `reportData` — lazy loaded per page
- `currentRegime` — drives the top nav regime badge

---

## Deploy on Railway

1. Push to GitHub
2. New Railway project → Deploy from GitHub
3. Set environment variable: `BACKEND_URL=https://your-backend.railway.app`
4. Railway auto-detects Next.js and runs `npm run build && npm start`

---

## Demo mode

If the backend is offline, the frontend falls back gracefully:
- Stock search uses local NSE universe data
- Generate button navigates through with a loading animation
- All pages remain navigable with realistic mock data
- A `backendOnline` flag in the Zustand store controls this

---

## File structure

```
src/
├── app/
│   ├── layout.tsx          # Root layout (fonts, global CSS)
│   ├── globals.css         # Tailwind + Catppuccin + component classes
│   ├── page.tsx            # Landing page
│   ├── configure/page.tsx  # Configure page
│   ├── overview/page.tsx   # Strategy overview
│   ├── schedule/page.tsx   # Execution schedule
│   ├── risk/page.tsx       # Risk analysis
│   ├── regime/page.tsx     # Regime monitor
│   ├── monitor/page.tsx    # Live monitor
│   └── report/page.tsx     # Post-execution report
├── components/
│   ├── layout/
│   │   ├── TopNav.tsx      # Top navigation bar
│   │   └── AppShell.tsx    # Wraps interior pages (TopNav + health check)
│   └── landing/
│       └── HeroCanvas.tsx  # Canvas stock-chart line animation
├── lib/
│   ├── api.ts              # Typed API client for all 8 endpoints
│   └── utils.ts            # fmtINR, fmtShares, color helpers
├── store/
│   └── execution.ts        # Zustand global state
└── types/
    └── index.ts            # TypeScript types for all API responses
```
