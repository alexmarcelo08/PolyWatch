import type { ActivityEvent, CopyTradeIntent } from "./types";
import { compactAddress } from "./validation";
import { formatLocal } from "./time";
import { getTelegramSettings } from "./storage";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatMoney(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatNumber(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return undefined;
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function buildTelegramMessage(event: ActivityEvent) {
  const lines = [
    "Polymarket Wallet Activity",
    "",
    `Wallet: ${escapeHtml(event.walletLabel)} (${compactAddress(event.address)})`,
    `Action: ${event.positionStatus ? `${event.side ?? ""} / ${event.positionStatus}` : event.action.replace(/_/g, " ")}`,
    `Market: ${escapeHtml(event.marketTitle)}`,
  ];

  if (event.outcome) lines.push(`Outcome: ${escapeHtml(event.outcome)}`);
  if (event.size !== undefined) lines.push(`Latest Size: ${formatNumber(event.size)} shares`);
  if (event.price !== undefined) lines.push(`Latest Price: ${formatNumber(event.price)}`);
  if (event.amountUsd !== undefined) lines.push(`Latest Value: ${formatMoney(event.amountUsd)}`);

  if (event.previousAvgPrice !== undefined || event.currentAvgPrice !== undefined) {
    lines.push("");
    lines.push("Average Update:");
    lines.push(`Previous Avg: ${formatNumber(event.previousAvgPrice) ?? "n/a"}`);
    lines.push(`New Avg: ${formatNumber(event.currentAvgPrice) ?? "n/a"}`);
    lines.push(`Avg Change: ${event.avgPriceChangeDirection ?? "unchanged"} ${formatNumber(event.avgPriceChange) ?? ""}`.trim());
  }

  if (event.positionBefore !== undefined || event.positionAfter !== undefined) {
    lines.push("");
    lines.push("Position:");
    lines.push(`Before: ${formatNumber(event.positionBefore) ?? "n/a"} shares`);
    lines.push(`After: ${formatNumber(event.positionAfter) ?? "n/a"} shares`);
    lines.push(`Change: ${formatNumber(event.positionChange) ?? "n/a"} shares`);
  }

  if (event.pnl !== undefined) lines.push(`PnL: ${formatMoney(event.pnl)}`);
  if (event.txHash) lines.push(`Tx: https://polygonscan.com/tx/${event.txHash}`);
  lines.push(`Time: ${formatLocal(event.timestamp)}`);
  return lines.join("\n");
}

export function buildCopyIntentMessage(intent: CopyTradeIntent) {
  return [
    "PolyWatch Copy Trade",
    "",
    `Status: ${intent.status}`,
    `Source Wallet: ${escapeHtml(intent.source_trade.walletLabel)}`,
    `Market: ${escapeHtml(intent.market)}`,
    `Outcome: ${escapeHtml(intent.outcome ?? "n/a")}`,
    `Side: ${intent.side ?? "n/a"}`,
    `Original: ${formatMoney(intent.original_amount)}`,
    `Copy Amount: ${formatMoney(intent.copied_amount)}`,
    `Risk: ${escapeHtml(intent.reason)}`,
    "",
    `Source Avg: ${formatNumber(intent.source_previous_avg_price) ?? "n/a"} -> ${formatNumber(intent.source_new_avg_price) ?? "n/a"}`,
    `Source Position: ${formatNumber(intent.source_position_before) ?? "n/a"} -> ${formatNumber(intent.source_position_after) ?? "n/a"}`,
    intent.status === "pending" ? "Confirm or reject in the PolyWatch dashboard." : "",
  ].filter(Boolean).join("\n");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTelegramMessage(message: string, chatIdOverride?: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = chatIdOverride || process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) throw new Error("Telegram configuration missing");

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          disable_web_page_preview: true,
        }),
      });

      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`Telegram send failed: ${response.status}`);
        await sleep(500 * 2 ** attempt);
        continue;
      }

      if (!response.ok) throw new Error(`Telegram send failed: ${response.status} ${await response.text()}`);
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError ?? new Error("Telegram send failed");
}

export async function sendActivityNotification(event: ActivityEvent) {
  const settings = await getTelegramSettings(event.userId);
  await sendTelegramMessage(buildTelegramMessage(event), settings.chatId);
}

export async function sendCopyIntentNotification(intent: CopyTradeIntent) {
  const settings = await getTelegramSettings(intent.userId);
  await sendTelegramMessage(buildCopyIntentMessage(intent), settings.chatId);
}

export async function sendUserTelegramMessage(userId: string, message: string) {
  const settings = await getTelegramSettings(userId);
  await sendTelegramMessage(message, settings.chatId);
}
