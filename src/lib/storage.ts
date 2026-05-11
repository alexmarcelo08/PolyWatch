import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { ActivityEvent, AppDatabase, PositionSnapshot, Wallet, WalletStatus } from "./types";
import { isValidWalletAddress, normalizeAddress } from "./validation";
import { nowIso } from "./time";

const MAX_ACTIVITY = 250;
const MAX_PROCESSED = 5000;

function defaultDb(): AppDatabase {
  return {
    wallets: [],
    activity: [],
    processed: [],
    positions: [],
    system: {
      pollCount: 0,
      running: false,
    },
  };
}

function dbPath() {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DATA_FILE_PATH ?? ".data/polywatch.json");
}

function lockPath() {
  return `${dbPath()}.lock`;
}

async function ensureDb() {
  const file = dbPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, JSON.stringify(defaultDb(), null, 2));
  }
}

async function readDbUnsafe(): Promise<AppDatabase> {
  await ensureDb();
  const raw = await fs.readFile(dbPath(), "utf8");
  return { ...defaultDb(), ...JSON.parse(raw) };
}

async function writeDbUnsafe(db: AppDatabase) {
  const file = dbPath();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, file);
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock() {
  await ensureDb();
  const started = Date.now();
  while (Date.now() - started < 8000) {
    try {
      const handle = await fs.open(lockPath(), "wx");
      await handle.close();
      return;
    } catch {
      await wait(75);
    }
  }
  throw new Error("Storage lock timed out");
}

async function withDb<T>(mutator: (db: AppDatabase) => T | Promise<T>) {
  await acquireLock();
  try {
    const db = await readDbUnsafe();
    const result = await mutator(db);
    db.activity = db.activity
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, MAX_ACTIVITY);
    db.processed = db.processed
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, MAX_PROCESSED);
    await writeDbUnsafe(db);
    return result;
  } finally {
    await fs.unlink(lockPath()).catch(() => undefined);
  }
}

export async function readDatabase() {
  return readDbUnsafe();
}

export async function listWallets() {
  const db = await readDbUnsafe();
  return db.wallets.sort((a, b) => a.label.localeCompare(b.label));
}

export async function addWallet(label: string, address: string) {
  if (!isValidWalletAddress(address)) throw new Error("Wallet address must be 0x-prefixed with 40 hex chars");
  const normalized = normalizeAddress(address);
  return withDb((db) => {
    if (db.wallets.some((wallet) => wallet.address === normalized)) {
      throw new Error("Wallet already tracked");
    }
    const now = nowIso();
    const wallet: Wallet = {
      id: randomUUID(),
      label: label.trim() || "Wallet",
      address: normalized,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };
    db.wallets.push(wallet);
    return wallet;
  });
}

export async function updateWallet(id: string, input: { label?: string; address?: string; status?: WalletStatus }) {
  return withDb((db) => {
    const wallet = db.wallets.find((item) => item.id === id);
    if (!wallet) throw new Error("Wallet not found");
    if (input.address) {
      if (!isValidWalletAddress(input.address)) throw new Error("Wallet address must be 0x-prefixed with 40 hex chars");
      const normalized = normalizeAddress(input.address);
      if (db.wallets.some((item) => item.id !== id && item.address === normalized)) {
        throw new Error("Wallet already tracked");
      }
      wallet.address = normalized;
    }
    if (input.label !== undefined) wallet.label = input.label.trim() || wallet.label;
    if (input.status) wallet.status = input.status;
    wallet.updatedAt = nowIso();
    wallet.lastError = undefined;
    return wallet;
  });
}

export async function deleteWallet(id: string) {
  return withDb((db) => {
    db.wallets = db.wallets.filter((wallet) => wallet.id !== id);
    db.activity = db.activity.filter((event) => event.walletId !== id);
    db.processed = db.processed.filter((item) => item.walletId !== id);
    db.positions = db.positions.filter((position) => position.walletId !== id);
  });
}

export async function markWalletChecked(id: string, ok: boolean, error?: string) {
  return withDb((db) => {
    const wallet = db.wallets.find((item) => item.id === id);
    if (!wallet) return;
    wallet.lastCheckedAt = nowIso();
    wallet.updatedAt = nowIso();
    wallet.status = ok ? "active" : "error";
    wallet.lastError = error;
  });
}

export async function startPoll() {
  return withDb((db) => {
    db.system.running = true;
    db.system.lastPollStartedAt = nowIso();
    db.system.lastError = undefined;
  });
}

export async function completePoll(error?: string) {
  return withDb((db) => {
    db.system.running = false;
    db.system.lastPollCompletedAt = nowIso();
    db.system.pollCount += 1;
    db.system.lastError = error;
  });
}

export async function hasProcessed(walletId: string, sourceId: string) {
  const db = await readDbUnsafe();
  return db.processed.some((item) => item.walletId === walletId && item.sourceId === sourceId);
}

export async function markProcessed(walletId: string, sourceId: string) {
  return withDb((db) => {
    if (!db.processed.some((item) => item.walletId === walletId && item.sourceId === sourceId)) {
      db.processed.push({ id: randomUUID(), walletId, sourceId, createdAt: nowIso() });
    }
  });
}

export async function saveActivity(event: Omit<ActivityEvent, "id" | "createdAt">) {
  return withDb((db) => {
    const existing = db.activity.find((item) => item.walletId === event.walletId && item.sourceId === event.sourceId);
    if (existing) return existing;
    const saved: ActivityEvent = { ...event, id: randomUUID(), createdAt: nowIso() };
    db.activity.unshift(saved);
    db.processed.push({ id: randomUUID(), walletId: event.walletId, sourceId: event.sourceId, createdAt: nowIso() });
    return saved;
  });
}

export async function recentActivity(limit = 80) {
  const db = await readDbUnsafe();
  return db.activity
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
    .slice(0, limit);
}

export async function getPositionsForWallet(walletId: string) {
  const db = await readDbUnsafe();
  return db.positions.filter((position) => position.walletId === walletId);
}

export async function replacePositionsForWallet(walletId: string, positions: PositionSnapshot[]) {
  return withDb((db) => {
    db.positions = db.positions.filter((position) => position.walletId !== walletId).concat(positions);
  });
}
