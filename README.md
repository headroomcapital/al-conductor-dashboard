# Agent League — Conductor Simulation Dashboard

Live simulation of 4 Conductor portfolios running against real-time crypto market data.

## What It Does

- **Live data**: BTC, ETH, SOL prices from Binance public API (no auth needed)
- **Regime detection**: Real-time market regime classification (Bull/Bear/Ranging/Crash) using EMA crossovers and RSI
- **4 Conductor portfolios**: Aegis (Conservative), Atlas (Balanced), Apex (Aggressive), Phantom Edge (Degen) — each running their v2.0 agent teams
- **Agent signals**: Agents fire LONG/SHORT/HEDGE/HOLD based on regime and strategy type
- **Circuit breakers**: Automatic drawdown protection per Conductor spec
- **Conductor voice**: Dynamic commentary that changes based on detected regime

## Architecture

```
Binance REST API (3s poll)
  → Price History Buffer (120 datapoints)
    → Regime Detector (EMA8/21 + RSI)
      → 4 Conductor Engines
        → Agent Signal Generators
          → Portfolio State Updates
            → React UI
```

Purely client-side. No backend. No API keys. No auth. Just static hosting.

## Run Locally

```bash
npm install
npm run dev
```

## Deploy

### Vercel (recommended)
1. Push to GitHub
2. Import in [vercel.com](https://vercel.com)
3. Deploy (auto-detects Vite)

### Netlify
1. Push to GitHub
2. Import in [netlify.com](https://netlify.com)
3. Build command: `npm run build`
4. Publish directory: `dist`

### GitHub Pages
1. `npm run build`
2. Deploy the `dist/` folder

## Tech Stack

- Vite + React 18
- Recharts (charts)
- Binance Public REST API (no auth)

## Note

This is a **simulation** — agent P&L is generated from a probabilistic model driven by real price data and regime detection. It demonstrates how the Conductor architecture works but does not execute real trades.
