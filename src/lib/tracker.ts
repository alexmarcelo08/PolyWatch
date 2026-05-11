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
import type { ActivityAction, ActivityEvent, CheckResult, PolymarketActivity, PolymarketPosition, PositionSnapshot, Wallet } from "./types";
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
  return [
    "closed",
    position.conditionId,
    position.asset,
    position.timestamp ?? "no-time",
    position.realizedPnl ?? "no-pnl",
  ].join(":");
}

function positionKey(position: Pick<PolymarketPosition, "conditionId" | "asset">) {
  return `${position.conditionId}:${position.asset}`;
}

function toSnapshot(walletId: string, position: PolymarketPosition): PositionSnapshot {
  return {
    walletId,
    key: positionKey(position),
    asset: position.asset,
    conditionId: position.conditionId,
    marketTitle: position.title ?? "Untitled market",
    outcome: position.outcome,
    size: Number(position.size ?? 0),
    avgPrice: position.avgPrice,
    currentValue: position.currentValue,
    cashPnl: position.cashPnl,
    realizedPnl: position.realizedPnl,
    curPrice: position.curPrice,
    updatedAt: nowIso(),
  };
}

function actionForTrade(activity: PolymarketActivity, priorPositions: Map<string, PositionSnapshot>): ActivityAction {
  if (activity.side === "SELL") return "SELL_FILLED";
  const key = activity.asset ? `${activity.conditionId}:${activity.asset}` : "";
  const prior = priorPositions.get(key);
  return prior && prior.size > EPSILON ? "BUY_FILLED" : "NEW_BET";
}

function toTradeEvent(wallet: Wallet, activity: PolymarketActivity, priorPositions: Map<string, PositionSnapshot>): Omit<ActivityEvent, "id" | "createdAt"> | undefined {
  if (activity.type !== "TRADE" || !activity.side) return undefined;
  const size = Number(activity.size ?? 0);
  const price = Number(activity.price ?? 0);
  return {
    walletId: wallet.id,
    walletLabel: wallet.label,
    address: wallet.address,
    sourceId: activitySourceId(activity),
    action: actionForTrade(activity, priorPositions),
    marketTitle: activity.title ?? "Untitled market",
    outcome: activity.outcome,
    side: activity.side,
    size,
    price,
    amountUsd: activity.usdcSize ?? size * price,
    txHash: activity.transactionHash,
    timestamp: unixToIso(activity.timestamp),
  };
}

function toClosedEvent(wallet: Wallet, position: PolymarketPosition): Omit<ActivityEvent, "id" | "createdAt"> {
  return {
    walletId: wallet.id,
    walletLabel: wallet.label,
    address: wallet.address,
    sourceId: closedSourceId(position),
    action: position.realizedPnl !== undefined ? "PNL_REALIZED" : "POSITION_CLOSED",
    marketTitle: position.title ?? "Untitled market",
    outcome: position.outcome,
    size: position.totalBought,
    price: position.curPrice,
    amountUsd: position.totalBought !== undefined && position.curPrice !== undefined ? position.totalBought * position.curPrice : undefined,
    timestamp: unixToIso(position.timestamp ?? Math.floor(Date.now() / 1000)),
    pnl: position.realizedPnl,
  };
}

async function saveAndNotify(event: Omit<ActivityEvent, "id" | "createdAt">, notify: boolean) {
  if (await hasProcessed(event.walletId, event.sourceId)) return false;
  const saved = await saveActivity(event);
  if (notify) {
    await sendActivityNotification(saved);
  }
  return true;
}

export async function checkWallet(wallet: Wallet, notify = true): Promise<CheckResult> {
  const firstCheck = !wallet.lastCheckedAt;
  const priorSnapshots = await getPositionsForWallet(wallet.id);
  const priorPositions = new Map(priorSnapshots.map((position) => [position.key, position]));

  try {
    const [activity, positions, closedPositions] = await Promise.all([
      fetchUserActivity(wallet.address),
      fetchCurrentPositions(wallet.address),
      fetchClosedPositions(wallet.address),
    ]);

    let newEvents = 0;
    const activeSnapshots = positions.map((position) => toSnapshot(wallet.id, position));

    for (const item of [...activity].reverse()) {
      const sourceId = activitySourceId(item);
      if (firstCheck) {
        await markProcessed(wallet.id, sourceId);
        continue;
      }
      const event = toTradeEvent(wallet, item, priorPositions);
      if (event && (await saveAndNotify(event, notify))) newEvents += 1;
    }

    for (const position of [...closedPositions].reverse()) {
      const sourceId = closedSourceId(position);
      if (firstCheck) {
        await markProcessed(wallet.id, sourceId);
        continue;
      }
      const event = toClosedEvent(wallet, position);
      if (await saveAndNotify(event, notify)) newEvents += 1;
    }

    for (const prior of priorSnapshots) {
      if (firstCheck || activeSnapshots.some((current) => current.key === prior.key)) continue;
      const sourceId = `position-closed:${prior.key}:${Date.now()}`;
      const event: Omit<ActivityEvent, "id" | "createdAt"> = {
        walletId: wallet.id,
        walletLabel: wallet.label,
        address: wallet.address,
        sourceId,
        action: "POSITION_CLOSED",
        marketTitle: prior.marketTitle,
        outcome: prior.outcome,
        size: prior.size,
        price: prior.curPrice,
        amountUsd: prior.currentValue,
        timestamp: nowIso(),
        pnl: prior.realizedPnl ?? prior.cashPnl,
      };
      if (await saveAndNotify(event, notify)) newEvents += 1;
    }

    await replacePositionsForWallet(wallet.id, activeSnapshots);
    await markWalletChecked(wallet.id, true);
    return { walletId: wallet.id, label: wallet.label, ok: true, newEvents };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markWalletChecked(wallet.id, false, message);
    return { walletId: wallet.id, label: wallet.label, ok: false, newEvents: 0, message };
  }
}

export async function checkAllWallets(notify = true) {
  await startPoll();
  const wallets = (await listWallets()).filter((wallet) => wallet.status !== "paused");
  const results: CheckResult[] = [];
  try {
    for (const wallet of wallets) {
      results.push(await checkWallet(wallet, notify));
    }
    const failed = results.find((result) => !result.ok);
    await completePoll(failed?.message);
    return results;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await completePoll(message);
    throw error;
  }
}
