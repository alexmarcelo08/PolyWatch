export function getPollIntervalMs() {
  const raw = Number(process.env.POLL_INTERVAL_SECONDS ?? "45");
  const seconds = Number.isFinite(raw) ? Math.min(Math.max(raw, 30), 300) : 45;
  return seconds * 1000;
}

export function getPublicConfig() {
  return {
    pollIntervalSeconds: getPollIntervalMs() / 1000,
    telegramConfigured: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID),
    storagePath: process.env.DATA_FILE_PATH ?? ".data/polywatch.json",
  };
}
