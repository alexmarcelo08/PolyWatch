import { checkWallet } from "./tracker";
import { getCopySettings, getPollingState, listActiveWalletsAll, upsertPollingState } from "./storage";
import type { PollingMode, Wallet } from "./types";
import { nowIso } from "./time";

const INTERVALS: Record<PollingMode, number> = {
  idle: 60_000,
  normal: 15_000,
  high_priority: 5_000,
  burst: 3_000,
  cooldown: 60_000,
};

function jitter(ms: number) {
  return Math.floor(Math.random() * Math.min(ms, 5000));
}

function isoFromNow(ms: number) {
  return new Date(Date.now() + ms).toISOString();
}

async function desiredBaseMode(wallet: Wallet): Promise<PollingMode> {
  const settings = await getCopySettings(wallet.userId, wallet.id);
  return settings.priority_mode ? "high_priority" : "normal";
}

export async function nextDueWallets(limit = 2) {
  const wallets = await listActiveWalletsAll();
  const due: Wallet[] = [];
  const now = Date.now();

  for (const wallet of wallets) {
    const state = await getPollingState(wallet.userId, wallet.id);
    if (!state?.next_poll_at) {
      const mode = await desiredBaseMode(wallet);
      await upsertPollingState(wallet.userId, wallet.id, {
        mode,
        next_poll_at: isoFromNow(jitter(INTERVALS[mode])),
        recent_activity_count: 0,
        failureCount: 0,
      });
      continue;
    }
    if (Date.parse(state.next_poll_at) <= now) due.push(wallet);
    if (due.length >= limit) break;
  }
  return due;
}

export async function pollScheduledWallet(wallet: Wallet) {
  const state = await getPollingState(wallet.userId, wallet.id);
  const started = Date.now();
  const result = await checkWallet(wallet, true);
  const latency = Date.now() - started;
  const baseMode = await desiredBaseMode(wallet);
  let mode: PollingMode = baseMode;
  let burstUntil = state?.burstUntil;
  const failureCount = result.ok ? 0 : (state?.failureCount ?? 0) + 1;

  if (result.newEvents > 0) {
    mode = "burst";
    burstUntil = isoFromNow(60_000);
  } else if (state?.mode === "burst" && state.burstUntil && Date.parse(state.burstUntil) > Date.now()) {
    mode = "burst";
  } else if (failureCount >= 3) {
    mode = "cooldown";
  } else if (state?.recent_activity_count === 0 && state?.last_activity_at && Date.now() - Date.parse(state.last_activity_at) > 10 * 60_000) {
    mode = "cooldown";
  }

  const interval = failureCount >= 3 ? 120_000 : INTERVALS[mode];
  await upsertPollingState(wallet.userId, wallet.id, {
    mode,
    previousMode: baseMode,
    burstUntil,
    last_activity_at: result.newEvents > 0 ? nowIso() : state?.last_activity_at,
    last_poll_at: nowIso(),
    next_poll_at: isoFromNow(interval + jitter(interval)),
    recent_activity_count: result.newEvents > 0 ? (state?.recent_activity_count ?? 0) + result.newEvents : Math.max(0, (state?.recent_activity_count ?? 0) - 1),
    api_latency: latency,
    failureCount,
    lastError: result.message,
  });
  return result;
}

export async function runPollingTick(limit = 2) {
  const due = await nextDueWallets(limit);
  return Promise.all(due.map((wallet) => pollScheduledWallet(wallet)));
}
