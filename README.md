<div align="center">

<img src="https://img.shields.io/badge/Next.js-15.5-black?style=for-the-badge&logo=next.js" />
<img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
<img src="https://img.shields.io/badge/Clerk-Auth-6C47FF?style=for-the-badge&logo=clerk&logoColor=white" />
<img src="https://img.shields.io/badge/Neon-PostgreSQL-00E699?style=for-the-badge&logo=postgresql&logoColor=black" />
<a href="https://stock-mind-p93x.vercel.app/">
  <img src="https://img.shields.io/badge/Vercel-Live%20Demo-000000?style=for-the-badge&logo=vercel" />
</a>

<br /><br />

# Artha Terminal

### AI-powered investment terminal for the Indian retail investor.
### Screen 500+ NSE stocks · 6-agent deep analysis · portfolio sync from your broker.
### Created by Priyansh Mathur

<br />

**[→ Try it live: artha-terminal-v2.vercel.app](https://artha-terminal-v2.vercel.app/)**

<br />

> *A Bloomberg Terminal for Bharat — without the $24,000/year price tag.*

</div>

---

## Live Demo

> **[→ Try it live: artha-terminal-v2.vercel.app](https://artha-terminal-v2.vercel.app/)**
>
> Sign up with any email → browse the screener → search any NSE stock (try `RELIANCE`, `TCS`, `INFY`) → click **Deep Scan** to run the AI.

---

## New here?

- 🗺  **[ARCHITECTURE.md](./ARCHITECTURE.md)** — plain-English tour of how the
  app is wired (diagrams, data flow, what fails when).
- 🛠  **[DEVELOPER_GUIDE.md](./DEVELOPER_GUIDE.md)** — onboarding for engineers
  (where to add features, conventions, common tasks, tech-debt map).
- 🤖 **[RALPH_TASK.md](./RALPH_TASK.md)** + **`.ralph/`** — the autonomous-iteration
  loop used to build the multi-agent chat at `/chat`.

---

## What is this?

Artha Terminal is a full-stack web app that brings institutional-grade stock research to retail investors. It combines live NSE/BSE market data with a 6-agent AI engine that scores every stock across fundamentals, technicals, moat, growth, sentiment, and risk — then spits out a clear verdict: **Strong Buy → Avoid**.

No spreadsheets. No juggling 10 browser tabs. Just open the terminal and decide.

---

## Features at a Glance

| | Feature | What it does |
|---|---|---|
| 🔍 | **NSE Screener** | Filter 500+ stocks by index (Nifty 50 / Midcap / Smallcap), PE, market cap, preset strategy |
| 🤖 | **6-Agent AI Analysis** | Every stock scored 0–10 across 6 dimensions → composite verdict with entry zone |
| 📊 | **Portfolio Manager** | Track stocks + mutual funds, see live P&L, unrealised gains |
| 🏦 | **Broker Sync** | Auto-import holdings from **Angel One** (SmartAPI) or **Zerodha** (CSV) |
| ⚖️ | **Smart Rebalancing** | AI detects overweight sectors and recommends rebalance moves |
| 🔔 | **Alerts & Watchlist** | Price alerts, signal-flip alerts, daily/weekly email digest |
| 📈 | **Interactive Charts** | TradingView-quality price charts — 1M to 5Y, Angel One + Yahoo fallback |
| 💰 | **Mutual Funds** | Track SIP/lump-sum holdings with live NAV, 1Y/3Y/5Y trailing returns |
| ⚡ | **Optimized RAG AI** | Advanced AI assistant with financial calculation tools, concise professional tone, and minimal UI |

---

## The AI Engine

6 specialised agents run **in parallel** on every stock:

```
┌─────────────────────────────────────────────────────────────────┐
│                     6-AGENT ANALYSIS ENGINE                     │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│ Fundamental  │     Moat     │  Technical   │      Growth        │
│    30%  ██████│    25%  █████│    20%  ████ │      10%  ██       │
│              │              │              │                    │
│ PE, PB, ROE  │ Brand, moat, │ Momentum,   │ Revenue CAGR,      │
│ debt, margins│ pricing power│ entry zone  │ bear/base/bull     │
├──────────────┴──────────────┴──────────────┴────────────────────┤
│         Risk  10%  ██         Sentiment  5%  █                  │
│         Volatility, drawdown  News tone, market bias            │
└─────────────────────────────────────────────────────────────────┘
         ↓
  Composite = F×30% + M×25% + T×20% + G×10% + R×10% + S×5%
         ↓
  ≥7.5 → Strong Buy  |  6–7.4 → Buy  |  4.5–6 → Hold
  3–4.5 → Caution    |  <3    → Avoid
```

---

## Quick Start (Local)

**Prerequisites:** Node.js 18+, npm 9+

```bash
# 1. Clone
git clone https://github.com/PriyanshMathur1/artha.git
cd artha

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.local.example .env.local
# → Fill in CLERK keys, DATABASE_URL (see Environment Variables section)

# 4. Generate Prisma client + run dev server
npx prisma generate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — the screener loads immediately.

**Quick test:** Visit `/stock/RELIANCE` — you should see live data + AI verdict.


## Deploy to Vercel

```bash
# One-command deploy
npx vercel --prod
```

Or connect your GitHub repo in the [Vercel dashboard](https://vercel.com/new) — it auto-detects Next.js.

**Required Vercel environment variables** (add in Project → Settings → Environment Variables):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
CLERK_SECRET_KEY
DATABASE_URL
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
```

Then trigger a redeploy — the app goes live in ~90 seconds.

---

## Tech Stack

```
Frontend          Next.js 15 (App Router + RSC) · React 18 · TailwindCSS 3
Charts            TradingView Lightweight Charts · Recharts
Data Fetching     SWR (stale-while-revalidate)
Auth              Clerk v7 (hosted sign-in/up, edge middleware)
Database          Neon PostgreSQL (serverless) · Prisma ORM v7
Market Data       yahoo-finance2 (free) · Angel One SmartAPI · MFAPI.in
Email             Nodemailer + Gmail SMTP
Deployment        Vercel (serverless functions + edge)
Language          TypeScript 5 (strict mode end-to-end)
```

---

## Project Structure

```
app/
├── page.tsx                  ← Home screener
├── stock/[ticker]/           ← Stock deep-dive page
├── portfolio/                ← Portfolio & MF tracking
├── watchlist/                ← Watchlist management
├── alerts/                   ← Price & signal alerts
├── rebalance/                ← Rebalancing engine
└── api/                      ← 23 REST endpoints

lib/
├── yahoo.ts                  ← Yahoo Finance wrapper + 60s cache
├── angelone.ts               ← Angel One SmartAPI client
├── zerodha.ts                ← Zerodha Kite client
├── mfapi.ts                  ← Mutual fund NAV + returns
├── universe.ts               ← NSE stock universe (500+)
└── agents/
    ├── fundamental.ts        ← PE, ROE, debt, margins
    ├── technical.ts          ← Momentum, entry zone, stop-loss
    ├── sentiment.ts          ← News tone, market bias
    ├── moat.ts               ← Brand, pricing power, switching cost
    ├── growth.ts             ← Revenue CAGR, bear/base/bull CAGR
    └── risk.ts               ← Volatility, drawdown, leverage

prisma/
└── schema.prisma             ← 7 models: Holdings, MF, Alerts, Watchlist, Cache...
```

---

## Database Schema (7 models)

| Model | Purpose |
|---|---|
| `StockHolding` | User's stock positions (qty, avg cost, buy date, broker) |
| `MFHolding` | Mutual fund holdings (units, invested NAV, amount) |
| `MFNavCache` | Global NAV history cache (avoids repeated API calls) |
| `Alert` | Price & signal alerts per user |
| `Watchlist` | User's tracked symbols |
| `RebalanceHistory` | Saved rebalancing recommendations |
| `FundamentalsCache` | PE, PB, ROE, EPS cached globally |
| `Settings` | Key-value store for broker tokens and config |

---

## Running Costs

| Service | Tier | Cost |
|---|---|---|
| Vercel | Hobby | **Free** (100 GB BW, 100 deploys/day) |
| Neon PostgreSQL | Free | **Free** (0.5 GB storage, serverless) |
| Clerk | Free | **Free** (10,000 MAU) |
| yahoo-finance2 | — | **Free** (unofficial, no key needed) |
| MFAPI.in | — | **Free** |

**Total running cost at zero scale: ₹0/month.**

---

## Legal Notice

> This app is built for **personal research and educational use only**.
>
> Under SEBI (Investment Advisers) Regulations 2013, providing investment advice for a fee requires SEBI RA registration. AI-generated scores are not financial advice — always do your own due diligence before investing.

---

## License

MIT — free to use for personal and educational purposes.

---

<div align="center">

Built with Next.js 15 · Clerk · Neon · Prisma · Deployed on Vercel

*Data: Yahoo Finance (unofficial) · Not affiliated with NSE, BSE, SEBI, or any broker.*

</div>
