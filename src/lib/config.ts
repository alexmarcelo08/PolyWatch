export function getPollIntervalMs() {
  const raw = Number(process.env.POLL_INTERVAL_SECONDS ?? "15");
  const seconds = Number.isFinite(raw) ? Math.min(Math.max(raw, 3), 300) : 15;
  return seconds * 1000;
}

export function getRiskConfig() {
  return {
    autoTradingEnabled: process.env.AUTO_TRADING_ENABLED === "true",
    dryRun: process.env.DRY_RUN !== "false",
    maxSlippageBps: Number(process.env.MAX_SLIPPAGE_BPS ?? "100") || 100,
    globalDailyMaxVolumeUsdc: Number(process.env.GLOBAL_DAILY_MAX_VOLUME_USDC ?? "0") || 0,
    globalDailyMaxLossUsdc: Number(process.env.GLOBAL_DAILY_MAX_LOSS_USDC ?? "0") || 0,
    maxCopyTradesPerDay: Number(process.env.MAX_COPY_TRADES_PER_DAY ?? "0") || 0,
    privateKeyConfigured: Boolean(process.env.POLYMARKET_PRIVATE_KEY),
  };
}

export function getPublicConfig() {
  const risk = getRiskConfig();
  return {
    pollIntervalSeconds: getPollIntervalMs() / 1000,
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    storagePath: process.env.DATA_FILE_PATH ?? ".data/polywatch.json",
    autoTradingEnabled: risk.autoTradingEnabled,
    dryRun: risk.dryRun,
    maxSlippageBps: risk.maxSlippageBps,
    globalDailyMaxVolumeUsdc: risk.globalDailyMaxVolumeUsdc,
    globalDailyMaxLossUsdc: risk.globalDailyMaxLossUsdc,
    maxCopyTradesPerDay: risk.maxCopyTradesPerDay,
  };
}
