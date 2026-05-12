import { getRiskConfig } from "./config";
import {
  getCopySettings,
  getRiskSettings,
  listCopyIntents,
  saveCopyIntent,
  updateCopyIntent,
} from "./storage";
import { sendCopyIntentNotification } from "./telegram";
import type { ActivityEvent, CopySettings, CopyTradeIntent, IntentStatus, Wallet } from "./types";
import { nowIso } from "./time";

function todayStart() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function includesMarket(patterns: string[], market: string) {
  const normalized = market.toLowerCase();
  return patterns.some((pattern) => pattern.trim() && normalized.includes(pattern.trim().toLowerCase()));
}

function includesOutcome(patterns: string[], outcome?: string) {
  if (!patterns.length) return true;
  return patterns.some((pattern) => pattern.trim().toLowerCase() === (outcome ?? "").trim().toLowerCase());
}

function baseIntent(wallet: Wallet, event: ActivityEvent, copiedAmount: number, status: IntentStatus, reason: string): Omit<CopyTradeIntent, "id" | "created_at"> {
  return {
    userId: wallet.userId,
    walletId: wallet.id,
    source_wallet: wallet.address,
    source_trade: event,
    copied_amount: copiedAmount,
    original_amount: event.amountUsd ?? 0,
    market: event.marketTitle,
    outcome: event.outcome,
    side: event.side,
    status,
    reason,
    source_previous_avg_price: event.previousAvgPrice,
    source_new_avg_price: event.currentAvgPrice,
    source_avg_price_change: event.avgPriceChange,
    source_position_before: event.positionBefore,
    source_position_after: event.positionAfter,
  };
}

async function dailyIntentStats(userId: string) {
  const since = todayStart().getTime();
  const intents = (await listCopyIntents(userId, 500)).filter((intent) => Date.parse(intent.created_at) >= since);
  return {
    count: intents.length,
    volume: intents.reduce((sum, intent) => sum + Math.max(0, intent.copied_amount), 0),
    loss: intents
      .filter((intent) => intent.status === "failed" || intent.status === "blocked")
      .reduce((sum, intent) => sum + Math.max(0, intent.copied_amount), 0),
  };
}

async function validate(settings: CopySettings, event: ActivityEvent, copiedAmount: number) {
  const risk = await getRiskSettings(event.userId);
  const env = getRiskConfig();
  const originalAmount = event.amountUsd ?? 0;
  const stats = await dailyIntentStats(event.userId);

  if (!settings.copy_enabled) return "Copy disabled";
  if (!event.side || event.amountUsd === undefined || !event.price || !event.size) return "Trade missing required price/size/value";
  if (settings.blocked_markets.length && includesMarket(settings.blocked_markets, event.marketTitle)) return "Market blocked";
  if (settings.allowed_markets.length && !includesMarket(settings.allowed_markets, event.marketTitle)) return "Market not allowed";
  if (!includesOutcome(settings.allowed_outcomes, event.outcome)) return "Outcome not allowed";
  if (settings.min_original_trade_size > 0 && originalAmount < settings.min_original_trade_size) return "Original trade below minimum";
  if (settings.max_original_trade_size > 0 && originalAmount > settings.max_original_trade_size) return "Original trade above maximum";
  if (copiedAmount <= 0) return "Copy amount is zero";
  if (settings.daily_max_volume_usdc > 0 && stats.volume + copiedAmount > settings.daily_max_volume_usdc) return "Wallet daily copy volume limit hit";
  if (risk.globalDailyMaxVolumeUsdc > 0 && stats.volume + copiedAmount > risk.globalDailyMaxVolumeUsdc) return "Global daily copy volume limit hit";
  if (risk.maxCopyTradesPerDay > 0 && stats.count >= risk.maxCopyTradesPerDay) return "Max copy trades per day hit";
  if (env.maxCopyTradesPerDay > 0 && stats.count >= env.maxCopyTradesPerDay) return "Env max copy trades per day hit";
  if (settings.stop_copy_after_losses && settings.daily_max_loss_usdc > 0 && stats.loss >= settings.daily_max_loss_usdc) return "Stopped after daily losses";
  if (risk.globalDailyMaxLossUsdc > 0 && stats.loss >= risk.globalDailyMaxLossUsdc) return "Global daily loss limit hit";
  return undefined;
}

function copyAmount(settings: CopySettings, event: ActivityEvent) {
  const original = event.amountUsd ?? 0;
  const scaled = original * (settings.copy_percentage / 100);
  return settings.max_copy_amount_usdc > 0 ? Math.min(scaled, settings.max_copy_amount_usdc) : scaled;
}

export async function handleCopyTrade(wallet: Wallet, event: ActivityEvent) {
  const settings = await getCopySettings(wallet.userId, wallet.id);
  if (!settings.copy_enabled || settings.copy_mode === "alert_only") return undefined;

  const amount = copyAmount(settings, event);
  const blockReason = await validate(settings, event, amount);
  if (blockReason) {
    const intent = await saveCopyIntent(baseIntent(wallet, event, amount, "blocked", blockReason));
    await sendCopyIntentNotification(intent).catch(() => undefined);
    return intent;
  }

  if (settings.copy_mode === "manual_confirm") {
    const intent = await saveCopyIntent(baseIntent(wallet, event, amount, "pending", "Awaiting manual confirmation"));
    await sendCopyIntentNotification(intent).catch(() => undefined);
    return intent;
  }

  const env = getRiskConfig();
  if (!env.autoTradingEnabled) {
    const intent = await saveCopyIntent(baseIntent(wallet, event, amount, "blocked", "AUTO_TRADING_ENABLED=false"));
    await sendCopyIntentNotification(intent).catch(() => undefined);
    return intent;
  }

  if (env.dryRun) {
    const intent = await saveCopyIntent(baseIntent(wallet, event, amount, "dry_run", "DRY_RUN=true; no order sent"));
    await sendCopyIntentNotification(intent).catch(() => undefined);
    return intent;
  }

  if (!env.privateKeyConfigured) {
    const intent = await saveCopyIntent(baseIntent(wallet, event, amount, "blocked", "POLYMARKET_PRIVATE_KEY missing"));
    await sendCopyIntentNotification(intent).catch(() => undefined);
    return intent;
  }

  const intent = await saveCopyIntent(baseIntent(wallet, event, amount, "failed", "Execution adapter TODO; no order sent"));
  await sendCopyIntentNotification(intent).catch(() => undefined);
  return intent;
}

export async function confirmIntent(userId: string, intentId: string) {
  const env = getRiskConfig();
  const status: IntentStatus = env.dryRun ? "dry_run" : env.autoTradingEnabled && env.privateKeyConfigured ? "failed" : "blocked";
  const reason = env.dryRun
    ? "Manual confirmation accepted; DRY_RUN=true; no order sent"
    : env.autoTradingEnabled && env.privateKeyConfigured
      ? "Execution adapter TODO; no order sent"
      : "Manual confirmation accepted, but auto trading/private key disabled";
  const intent = await updateCopyIntent(userId, intentId, { status, reason, executed_at: nowIso() });
  await sendCopyIntentNotification(intent).catch(() => undefined);
  return intent;
}

export async function rejectIntent(userId: string, intentId: string) {
  return updateCopyIntent(userId, intentId, { status: "rejected", reason: "Rejected by user", executed_at: nowIso() });
}
