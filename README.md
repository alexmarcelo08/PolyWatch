# PolyWatch

PolyWatch is a lightweight Polymarket wallet tracker and dry-run-first copy-trading assistant built with Next.js, TypeScript, local JSON storage, and Telegram notifications.

## Data Source Choice

PolyWatch uses the public Polymarket Data API as the primary source:

- `GET https://data-api.polymarket.com/activity?user={address}` for parsed wallet activity, including side, size, USDC size, price, market title, outcome, timestamp, and Polygon transaction hash.
- `GET https://data-api.polymarket.com/positions?user={address}` for current position snapshots and PnL fields when available.
- `GET https://data-api.polymarket.com/closed-positions?user={address}` for closed markets and realized PnL when available.

Why this source: it is public, parsed, wallet-address keyed, and includes Polymarket market metadata without CLOB authentication. Polygon raw logs are more canonical for settlement-grade reconciliation, but they require decoding Conditional Tokens, exchange contracts, proxy wallets, and metadata joins. For this tracker, the Data API is the best reliability-to-complexity tradeoff for a 2 vCPU / 2GB RAM Zeabur VPS.

References:

- [Polymarket API overview](https://docs.polymarket.com/api-reference/introduction)
- [Polymarket market data overview](https://docs.polymarket.com/market-data/overview)
- [Get user activity](https://docs.polymarket.com/api-reference/core/get-user-activity)
- [Get current positions for a user](https://docs.polymarket.com/api-reference/core/get-current-positions-for-a-user)
- [Get closed positions for a user](https://docs.polymarket.com/api-reference/core/get-closed-positions-for-a-user)
- [Polymarket rate limits](https://docs.polymarket.com/api-reference/rate-limits)
- [Telegram Bot API sendMessage](https://core.telegram.org/bots/api#sendmessage)

## Features

- Multi-user login with local JSON users, scrypt password hashes, and HTTP-only session cookies.
- Admin user is seeded from `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
- Each user has isolated wallets, activities, positions, copy settings, trade intents, Telegram chat ID, and risk settings.
- Add, edit, pause, resume, and delete tracked wallets.
- Hybrid polling scheduler with staggered due-wallet polling, priority mode, burst mode after activity, cooldown after inactivity/failures, request timeouts, retries, and API health samples.
- Detect buy/sell fills, new positions, reducing/closing positions, and realized PnL when exposed by Polymarket.
- Weighted average entry price tracking per wallet + market + outcome.
- Telegram alerts include latest trade size/price/value, previous average, new average, average direction, and position before/after.
- Per-wallet copy trading config: alert-only, manual confirm, or auto-copy.
- Manual confirmation creates pending intents that can be confirmed or rejected from the dashboard.
- Auto-copy is safe by default. Real execution is not implemented in this phase.
- Dry-run mode creates dry-run/blocked intents without sending orders.
- Local JSON storage with schema migration, atomic temp-file writes, lock file, corruption fallback, and data caps.

## Environment Variables

```bash
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=change-me-long-password

POLL_INTERVAL_SECONDS=15
DATA_FILE_PATH=.data/polywatch.json

AUTO_TRADING_ENABLED=false
DRY_RUN=true
MAX_SLIPPAGE_BPS=100
GLOBAL_DAILY_MAX_VOLUME_USDC=0
GLOBAL_DAILY_MAX_LOSS_USDC=0
MAX_COPY_TRADES_PER_DAY=0
POLYMARKET_PRIVATE_KEY=
```

Notes:

- `TELEGRAM_BOT_TOKEN` is global and stays in env.
- `TELEGRAM_CHAT_ID` seeds the first admin user's chat ID. Users can later set their own chat ID in the dashboard.
- `AUTO_TRADING_ENABLED=false` and `DRY_RUN=true` are the safe defaults.
- `POLYMARKET_PRIVATE_KEY` is never exposed in API responses or UI. The real execution adapter is still a TODO stub, so no live order is sent by this version.
- Risk caps set to `0` mean disabled.

## Local Setup

```bash
npm install
copy .env.example .env.local
```

Edit `.env.local`, especially:

```bash
ADMIN_EMAIL=your@email.com
ADMIN_PASSWORD=your-long-password
TELEGRAM_BOT_TOKEN=123456:your_bot_token
TELEGRAM_CHAT_ID=123456789
```

Run the web app:

```bash
npm run dev
```

Run the polling worker in another terminal:

```bash
npm run worker
```

Open [http://localhost:3000](http://localhost:3000), sign in, then open the dashboard.

## How Polling Works

1. Add a wallet in the dashboard.
2. The first check seeds processed IDs and current position snapshots, so old historical activity does not spam Telegram.
3. Later checks fetch recent activity, current positions, and closed positions.
4. New source IDs are saved before notification sending.
5. If a trade is detected, PolyWatch updates position analytics, sends a wallet alert, and evaluates copy-trading settings.
6. Burst mode polls that wallet every 3 seconds for 60 seconds after detected activity, then returns to normal or priority cadence.

Default cadence:

- Normal wallets: about 15 seconds.
- Priority wallets: about 5 seconds.
- Burst mode: about 3 seconds for 60 seconds.
- Cooldown: 60 to 120 seconds after inactivity or repeated failures.

The scheduler polls only due wallets and limits concurrency to keep Zeabur VPS load low.

## Copy Trading Safety

Copy modes:

- `alert_only`: send alerts only.
- `manual_confirm`: create a pending intent; confirm or reject it in the dashboard.
- `auto_copy`: evaluates risk and env gates. With default env, it blocks or dry-runs and sends no order.

Real trading requires all gates:

- `AUTO_TRADING_ENABLED=true`
- `DRY_RUN=false`
- `POLYMARKET_PRIVATE_KEY` exists
- risk checks pass
- market execution adapter is implemented

Current execution adapter status: TODO stub. Live orders are intentionally unavailable in this phase.

## Average Price Calculation

Positions are tracked by user, wallet, condition ID, asset, and outcome.

BUY:

```text
new_avg_price =
((old_position_size * old_avg_price) + (new_trade_size * new_trade_price))
/ (old_position_size + new_trade_size)
```

SELL:

- Reduces position size.
- Keeps average entry price for remaining shares.
- Marks closed when the sell size fully closes the position.

Each activity stores previous average, new average, average delta/direction, position before, position after, and position change. Copy trade intents include the same average context.

## Commands

```bash
npm run dev
npm run worker
npm run lint
npm run typecheck
npm run build
```

## Zeabur Deployment

Set env vars in Zeabur before the first authenticated deploy:

```bash
ADMIN_EMAIL=your@email.com
ADMIN_PASSWORD=your-long-password
TELEGRAM_BOT_TOKEN=123456:your_bot_token
TELEGRAM_CHAT_ID=123456789
DATA_FILE_PATH=/data/polywatch.json
AUTO_TRADING_ENABLED=false
DRY_RUN=true
MAX_SLIPPAGE_BPS=100
GLOBAL_DAILY_MAX_VOLUME_USDC=0
GLOBAL_DAILY_MAX_LOSS_USDC=0
MAX_COPY_TRADES_PER_DAY=0
```

For the existing Docker deployment, keep a persistent volume mounted at `/data`. The app runs the Next.js server and the worker in the same lightweight container via `npm run start:prod`.

Useful deployment checks:

```bash
npm run typecheck
npm run lint
npm run build
```

Then deploy the latest branch/commit through Zeabur. Existing single-user JSON data migrates into the seeded admin user when the new schema first loads.

## Storage Shape

The JSON store is migrated to:

```json
{
  "users": [],
  "sessions": [],
  "wallets": [],
  "activity": [],
  "processed": [],
  "positions": [],
  "copySettings": [],
  "copyTradeIntents": [],
  "telegramSettings": [],
  "riskSettings": [],
  "pollingState": [],
  "apiHealth": [],
  "system": {}
}
```

Data is user-scoped by `userId`. API routes require a session and filter by the current user.
