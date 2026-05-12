import { fetchClosedPositions, fetchCurrentPositions, fetchUserActivity } from "./polymarket";
import {
  completePoll,
  getPositionsForWallet,
  hasProcessed,
  listWallets,
  markProcessed,
  markWalletChecked,
  replacePositionsForWallet,
  saveActivity,
  startPoll,
} from "./storage";
import { sendActivityNotification } from "./telegram";
import { handleCopyTrade } from "./copy-trading";
import type { ActivityAction, ActivityEvent, CheckResult, PolymarketActivity, PolymarketPosition, PositionSnapshot, PositionStatus, Wallet } from "./types";
import { nowIso, unixToIso } from "./time";

const EPSILON = 0.000001;

function activitySourceId(activity: PolymarketActivity) {
  return [
    "activity",
    activity.type,
    activity.transactionHash ?? "no-tx",
    activity.conditionId,
    activity.asset ?? "no-asset",
    activity.timestamp,
    activity.side ?? "no-side",
    activity.size ?? "no-size",
    activity.price ?? "no-price",
  ].join(":");
}

function closedSourceId(position: PolymarketPosition) {
  return ["closed", position.conditionId, position.asset, position.timestamp ?? "no-time", position.realizedPnl ?? "no-pnl"].join(":");
}

function positionKey(position: Pick<PolymarketPosition, "conditionId" | "asset">) {
  return `${position.conditionId}:${position.asset}`;
}

function direction(delta: number) {
  if (Math.abs(delta) <= EPSILON) return "unchanged";
  return delta > 0 ? "increased" : "decreased";
}

function toSnapshot(userId: string, walletId: string, position: PolymarketPosition, prior?: PositionSnapshot): PositionSnapshot {
  const size = Number(position.size ?? 0);
  const avgPrice = position.avgPrice ?? prior?.avgPrice;
  const previousAvgPrice = prior?.avgPrice;
  const delta = avgPrice !== undefined && previousAvgPrice !== undefined ? avgPrice - previousAvgPrice : 0;
  return {
    userId,
    walletId,
    key: positionKey(position),
    asset: position.asset,
    conditionId: position.conditionId,
    marketTitle: position.title ?? prior?.marketTitle ?? "Untitled market",
    outcome: position.outcome ?? prior?.outcome,
    size,
    avgPrice,
    previousAvgPrice,
    avgPriceChange: delta,
    avgPriceChangeDirection: direction(delta),
    latestTradePrice: prior?.latestTradePrice,
    totalBought: position.totalBought ?? prior?.totalBought,
    totalSold: prior?.totalSold,
    currentValue: position.currentValue,
    cashPnl: position.cashPnl,
    realizedPnl: position.realizedPnl,
    curPrice: position.curPrice,
    status: size > EPSILON ? "increasing" : "closed",
    updatedAt: nowIso(),
  };
}

function applyTrade(prior: PositionSnapshot | undefined, trade: PolymarketActivity, userId: string, wallet: Wallet) {
  const size = Number(trade.size ?? 0);
  const price = Number(trade.price ?? 0);
  const before = prior?.size ?? 0;
  const previousAvg = prior?.avgPrice;
  const key = trade.asset ? `${trade.conditionId}:${trade.asset}` : `${trade.conditionId}:unknown`;
  let after = before;
  let currentAvg = previousAvg;
  let status: PositionStatus = "opening";
  let action: ActivityAction = "NEW_BET";
  let totalBought = prior?.totalBought ?? 0;
  let totalSold = prior?.totalSold ?? 0;

  if (trade.side === "BUY") {
    after = before + size;
    currentAvg = before > EPSILON && previousAvg !== undefined
      ? ((before * previousAvg) + (size * price)) / Math.max(after, EPSILON)
      : price;
    status = before > EPSILON ? "increasing" : "opening";
    action = before > EPSILON ? "BUY_FILLED" : "NEW_BET";
    totalBought += size;
  } else {
    after = Math.max(0, before - size);
    currentAvg = after > EPSILON ? previousAvg : previousAvg;
    status = after <= EPSILON ? "closing" : "reducing";
    action = after <= EPSILON ? "POSITION_CLOSED" : "SELL_FILLED";
    totalSold += size;
  }

  const avgDelta = currentAvg !== undefined && previousAvg !== undefined ? currentAvg - previousAvg : 0;
  const snapshot: PositionSnapshot = {
    userId,
    walletId: wallet.id,
    key,
    asset: trade.asset ?? prior?.asset ?? "unknown",
    conditionId: trade.conditionId,
    marketTitle: trade.title ?? prior?.marketTitle ?? "Untitled market",
    outcome: trade.outcome ?? prior?.outcome,
    size: after,
    avgPrice: currentAvg,
    previousAvgPrice: previousAvg,
    avgPriceChange: avgDelta,
    avgPriceChangeDirection: direction(avgDelta),
    latestTradePrice: price,
    totalBought,
    totalSold,
    currentValue: after * price,
    curPrice: price,
    status: after <= EPSILON ? "closed" : status,
    updatedAt: nowIso(),
  };

  return { snapshot, action, status, before, after, previousAvg, currentAvg, avgDelta };
}

function toTradeEvent(wallet: Wallet, activity: PolymarketActivity, priorPositions: Map<string, PositionSnapshot>): { event: Omit<ActivityEvent, "id" | "createdAt">; snapshot: PositionSnapshot } | undefined {
  if (activity.type !== "TRADE" || !activity.side || !activity.asset) return undefined;
  const applied = applyTrade(priorPositions.get(`${activity.conditionId}:${activity.asset}`), activity, wallet.userId, wallet);
  const size = Number(activity.size ?? 0);
  const price = Number(activity.price ?? 0);
  return {
    snapshot: applied.snapshot,
    event: {
      userId: wallet.userId,
      walletId: wallet.id,
      walletLabel: wallet.label,
      address: wallet.address,
      sourceId: activitySourceId(activity),
      action: applied.action,
      positionStatus: applied.status,
      marketTitle: activity.title ?? "Untitled market",
      conditionId: activity.conditionId,
      asset: activity.asset,
      outcome: activity.outcome,
      side: activity.side,
      size,
      price,
      amountUsd: activity.usdcSize ?? size * price,
      txHash: activity.transactionHash,
      timestamp: unixToIso(activity.timestamp),
      previousAvgPrice: applied.previousAvg,
      currentAvgPrice: applied.currentAvg,
      avgPriceChange: applied.avgDelta,
      avgPriceChangeDirection: direction(applied.avgDelta),
      positionBefore: applied.before,
      positionAfter: applied.after,
      positionChange: applied.after - applied.before,
    },
  };
}

function toClosedEvent(wallet: Wallet, position: PolymarketPosition): Omit<ActivityEvent, "id" | "createdAt"> {
  return {
    userId: wallet.userId,
    walletId: wallet.id,
    walletLabel: wallet.label,
    address: wallet.address,
    sourceId: closedSourceId(position),
    action: position.realizedPnl !== undefined ? "PNL_REALIZED" : "POSITION_CLOSED",
    positionStatus: "closed",
    marketTitle: position.title ?? "Untitled market",
    conditionId: position.conditionId,
    asset: position.asset,
    outcome: position.outcome,
    size: position.totalBought,
    price: position.curPrice,
    amountUsd: position.totalBought !== undefined && position.curPrice !== undefined ? position.totalBought * position.curPrice : undefined,
    timestamp: unixToIso(position.timestamp ?? Math.floor(Date.now() / 1000)),
    pnl: position.realizedPnl,
  };
}

async function saveNotifyAndCopy(wallet: Wallet, event: Omit<ActivityEvent, "id" | "createdAt">, notify: boolean) {
  if (await hasProcessed(event.userId, event.walletId, event.sourceId)) return false;
  const saved = await saveActivity(event);
  if (notify) await sendActivityNotification(saved).catch(() => undefined);
  await handleCopyTrade(wallet, saved).catch(() => undefined);
  return true;
}

export async function checkWallet(wallet: Wallet, notify = true): Promise<CheckResult> {
  const firstCheck = !wallet.lastCheckedAt;
  const priorSnapshots = await getPositionsForWallet(wallet.userId, wallet.id);
  const positionMap = new Map(priorSnapshots.map((position) => [position.key, position]));

  try {
    const [activity, positions, closedPositions] = await Promise.all([
      fetchUserActivity(wallet.address),
      fetchCurrentPositions(wallet.address),
      fetchClosedPositions(wallet.address),
    ]);

    let newEvents = 0;
    for (const item of [...activity].reverse()) {
      const sourceId = activitySourceId(item);
      if (firstCheck) {
        await markProcessed(wallet.userId, wallet.id, sourceId);
        continue;
      }
      const parsed = toTradeEvent(wallet, item, positionMap);
      if (!parsed) continue;
      positionMap.set(parsed.snapshot.key, parsed.snapshot);
      if (await saveNotifyAndCopy(wallet, parsed.event, notify)) newEvents += 1;
    }

    for (const position of [...closedPositions].reverse()) {
      const sourceId = closedSourceId(position);
      if (firstCheck) {
        await markProcessed(wallet.userId, wallet.id, sourceId);
        continue;
      }
      const event = toClosedEvent(wallet, position);
      if (await saveNotifyAndCopy(wallet, event, notify)) newEvents += 1;
    }

    const activeSnapshots = positions.map((position) => {
      const key = positionKey(position);
      const existing = positionMap.get(key);
      return existing && existing.size > EPSILON ? existing : toSnapshot(wallet.userId, wallet.id, position, existing);
    });
    const activeKeys = new Set(activeSnapshots.map((position) => position.key));
    const closedSnapshots = [...positionMap.values()].filter((position) => !activeKeys.has(position.key) && position.size <= EPSILON);

    await replacePositionsForWallet(wallet.userId, wallet.id, activeSnapshots.concat(closedSnapshots));
    await markWalletChecked(wallet.userId, wallet.id, true);
    return { walletId: wallet.id, label: wallet.label, ok: true, newEvents };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markWalletChecked(wallet.userId, wallet.id, false, message);
    return { walletId: wallet.id, label: wallet.label, ok: false, newEvents: 0, message };
  }
}

export async function checkAllWallets(userId: string, notify = true) {
  await startPoll();
  const wallets = (await listWallets(userId)).filter((wallet) => wallet.status !== "paused");
  const results: CheckResult[] = [];
  try {
    for (const wallet of wallets) results.push(await checkWallet(wallet, notify));
    const failed = results.find((result) => !result.ok);
    await completePoll(failed?.message);
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completePoll(message);
    throw error;
  }
}
