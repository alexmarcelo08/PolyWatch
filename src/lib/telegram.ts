import type { ActivityEvent } from "./types";
import { compactAddress } from "./validation";
import { formatLocal } from "./time";

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
    "🚨 <b>Polymarket Wallet Activity</b>",
    "",
    `Wallet: ${escapeHtml(event.walletLabel)} (${compactAddress(event.address)})`,
    `Action: <b>${event.action.replace(/_/g, " ")}</b>`,
    `Market: ${escapeHtml(event.marketTitle)}`,
  ];

  if (event.outcome) lines.push(`Side: ${escapeHtml(event.outcome)}`);
  if (event.size !== undefined) lines.push(`Shares: ${formatNumber(event.size)}`);
  if (event.amountUsd !== undefined) lines.push(`Amount: ${formatMoney(event.amountUsd)}`);
  if (event.price !== undefined) lines.push(`Price: ${formatNumber(event.price)}`);
  if (event.pnl !== undefined) lines.push(`PnL: ${formatMoney(event.pnl)}`);
  if (event.txHash) lines.push(`Tx: https://polygonscan.com/tx/${event.txHash}`);
  lines.push(`Time: ${formatLocal(event.timestamp)}`);
  return lines.join("\n");
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendTelegramMessage(message: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    throw new Error("Telegram env vars missing: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID");
  }

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      });

      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`Telegram send failed: ${response.status}`);
        await sleep(500 * 2 ** attempt);
        continue;
      }

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Telegram send failed: ${response.status} ${body}`);
      }
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await sleep(500 * 2 ** attempt);
    }
  }
  throw lastError ?? new Error("Telegram send failed");
}

export async function sendActivityNotification(event: ActivityEvent) {
  await sendTelegramMessage(buildTelegramMessage(event));
}
