# PolyWatch

Polymarket wallet tracker built with Next.js, TypeScript, local JSON storage, and Telegram notifications.

## Data Source Choice

PolyWatch uses the public Polymarket Data API as the primary source:

- `GET https://data-api.polymarket.com/activity?user={address}` for parsed wallet activity, including type, side, size, USDC size, price, market title, outcome, timestamp, and Polygon transaction hash.
- `GET https://data-api.polymarket.com/positions?user={address}` for current position snapshots and unrealized/realized PnL fields when available.
- `GET https://data-api.polymarket.com/closed-positions?user={address}` for closed markets and realized PnL.

Why this source: it is public, parsed, wallet-address keyed, and gives Polymarket market metadata without requiring CLOB authentication. Polygon raw logs are more canonical for settlement-grade reconciliation, but they require decoding Conditional Tokens, exchange contracts, proxy wallets, and metadata joins. For this tracker, Data API gives the best reliability-to-complexity tradeoff. The code keeps transaction hashes so alerts can link back to Polygonscan.

References:

- [Polymarket API overview](https://docs.polymarket.com/api-reference/introduction)
- [Polymarket market data overview](https://docs.polymarket.com/market-data/overview)
- [Get user activity](https://docs.polymarket.com/api-reference/core/get-user-activity)
- [Get trades for a user or markets](https://docs.polymarket.com/api-reference/core/get-trades-for-a-user-or-markets)
- [Get current positions for a user](https://docs.polymarket.com/api-reference/core/get-current-positions-for-a-user)
- [Get closed positions for a user](https://docs.polymarket.com/api-reference/core/get-closed-positions-for-a-user)
- [Polymarket rate limits](https://docs.polymarket.com/api-reference/rate-limits)
- [Telegram Bot API sendMessage](https://core.telegram.org/bots/api#sendmessage)

## Features

- Add, edit, pause, resume, and delete tracked wallets.
- Track multiple wallet addresses.
- Detect new bets, buy fills, sell fills, closed positions, and realized PnL where Polymarket exposes it.
- Store wallet state, recent activity, position snapshots, and processed IDs in `.data/polywatch.json`.
- Deduplicate alerts by source activity/position IDs.
- Send compact Telegram notifications with market, side, size, amount, price, PnL, transaction hash, and time.
- Manual Check Now button.
- Telegram test button.
- 30-300 second polling interval through `POLL_INTERVAL_SECONDS`.
- Retry Polymarket requests and log worker errors without crashing.

## Local Setup

```bash
npm install
```

```bash
copy .env.example .env.local
```

Set these values in `.env.local`:

```bash
TELEGRAM_BOT_TOKEN=123456:your_bot_token
TELEGRAM_CHAT_ID=123456789
POLL_INTERVAL_SECONDS=45
DATA_FILE_PATH=.data/polywatch.json
```

Run the web app:

```bash
npm run dev
```

Run the polling worker in another terminal:

```bash
npm run worker
```

Open [http://localhost:3000](http://localhost:3000).

## How Polling Works

1. Add a wallet in the dashboard.
2. The first check seeds processed IDs and current position snapshots, so old historical activity does not spam Telegram.
3. Later checks fetch recent activity plus current/closed positions.
4. New source IDs are saved before notification sending.
5. If Telegram sending fails, the activity remains in the dashboard and the worker logs the error.

Manual checks call the same tracker service as the worker.

## Commands

```bash
npm run dev
```

```bash
npm run worker
```

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm run build
```

## Deployment Notes

Best simple deployment: a long-running Node host such as a Zeabur VPS, Fly.io, Render background worker, Railway, or Docker on a small server.

### Zeabur VPS with Docker Compose

Copy the project to the VPS, then create `.env`:

```bash
TELEGRAM_BOT_TOKEN=123456:your_bot_token
TELEGRAM_CHAT_ID=123456789
POLL_INTERVAL_SECONDS=45
```

Start it:

```bash
docker compose up -d --build
```

View logs:

```bash
docker compose logs -f
```

The app listens on port `3000`. Persistent tracker data lives in the Docker volume `polywatch-data`.

From Windows, this repo also includes a helper:

```powershell
.\deploy\zeabur-vps-deploy.ps1 -HostName YOUR_VPS_IP -User root
```

Create `/opt/polywatch/.env` on the VPS before first run, or edit it after upload and run `docker compose up -d --build` again.

Run two processes:

- `npm run start` for Next.js.
- `npm run worker` for polling.

Persist `.data/polywatch.json` on a mounted volume. For multi-instance production, replace JSON storage with SQLite on a durable disk or Postgres, then keep the same storage interface.

Vercel-style serverless hosting can run the dashboard and API routes, but it is not ideal for the always-on worker or local JSON storage. If deploying there, move storage to Postgres/Supabase/Neon and trigger polling from a scheduled job.
