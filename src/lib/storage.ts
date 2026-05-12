import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  ActivityEvent,
  ApiHealthSample,
  AppDatabase,
  CopySettings,
  CopyTradeIntent,
  PollingState,
  PositionSnapshot,
  ProcessedItem,
  RiskSettings,
  Session,
  TelegramSettings,
  User,
  Wallet,
  WalletStatus,
} from "./types";
import { isValidWalletAddress, normalizeAddress } from "./validation";
import { nowIso } from "./time";
import { hashPassword } from "./password";
import { getRiskConfig } from "./config";

const SCHEMA_VERSION = 2;
const MAX_ACTIVITY_PER_USER = 350;
const MAX_PROCESSED_PER_USER = 6000;
const MAX_INTENTS_PER_USER = 600;
const MAX_API_HEALTH = 300;

function emptyDb(): AppDatabase {
  return {
    schemaVersion: SCHEMA_VERSION,
    users: [],
    sessions: [],
    wallets: [],
    activity: [],
    processed: [],
    positions: [],
    copySettings: [],
    copyTradeIntents: [],
    telegramSettings: [],
    riskSettings: [],
    pollingState: [],
    apiHealth: [],
    system: { pollCount: 0, running: false },
  };
}

function dbPath() {
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.DATA_FILE_PATH ?? ".data/polywatch.json");
}

function lockPath() {
  return `${dbPath()}.lock`;
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function adminEmail() {
  return (process.env.ADMIN_EMAIL ?? "admin@polywatch.local").trim().toLowerCase();
}

async function ensureAdmin(db: AppDatabase) {
  const email = adminEmail();
  const existing = db.users.find((user) => user.email.toLowerCase() === email);
  if (existing) return existing;
  const password = process.env.ADMIN_PASSWORD ?? randomUUID();
  const now = nowIso();
  const user: User = {
    id: randomUUID(),
    email,
    passwordHash: await hashPassword(password),
    role: "admin",
    createdAt: now,
    updatedAt: now,
  };
  db.users.push(user);
  return user;
}

function coerceArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function migrate(raw: unknown): Promise<AppDatabase> {
  const source = (raw && typeof raw === "object" ? raw : {}) as Partial<AppDatabase>;
  const db: AppDatabase = {
    ...emptyDb(),
    ...source,
    users: coerceArray<User>(source.users),
    sessions: coerceArray<Session>(source.sessions),
    wallets: coerceArray<Wallet>(source.wallets),
    activity: coerceArray<ActivityEvent>(source.activity),
    processed: coerceArray<ProcessedItem>(source.processed),
    positions: coerceArray<PositionSnapshot>(source.positions),
    copySettings: coerceArray<CopySettings>(source.copySettings),
    copyTradeIntents: coerceArray<CopyTradeIntent>(source.copyTradeIntents),
    telegramSettings: coerceArray<TelegramSettings>(source.telegramSettings),
    riskSettings: coerceArray<RiskSettings>(source.riskSettings),
    pollingState: coerceArray<PollingState>(source.pollingState),
    apiHealth: coerceArray<ApiHealthSample>(source.apiHealth),
    system: { ...emptyDb().system, ...(source.system ?? {}) },
    schemaVersion: SCHEMA_VERSION,
  };

  const admin = await ensureAdmin(db);
  for (const wallet of db.wallets) {
    wallet.userId ||= admin.id;
    wallet.address = normalizeAddress(wallet.address);
  }
  for (const event of db.activity) event.userId ||= admin.id;
  for (const item of db.processed) item.userId ||= admin.id;
  for (const position of db.positions) {
    position.userId ||= admin.id;
    position.status ||= position.size > 0 ? "increasing" : "closed";
  }
  db.sessions = db.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
  ensureUserDefaults(db, admin.id);
  return db;
}

async function ensureDb() {
  const file = dbPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, JSON.stringify(await migrate(emptyDb()), null, 2));
  }
}

async function readDbUnsafe(): Promise<AppDatabase> {
  await ensureDb();
  try {
    return await migrate(JSON.parse(await fs.readFile(dbPath(), "utf8")));
  } catch {
    const corrupt = `${dbPath()}.corrupt.${Date.now()}`;
    await fs.rename(dbPath(), corrupt).catch(() => undefined);
    const db = await migrate(emptyDb());
    await writeDbUnsafe(db);
    return db;
  }
}

async function writeDbUnsafe(db: AppDatabase) {
  return writeDbStringUnsafe(JSON.stringify(db, null, 2));
}

async function writeDbStringUnsafe(serialized: string) {
  const file = dbPath();
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, serialized);
  await fs.rename(tmp, file);
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

function trimByUser<T extends { userId: string; createdAt?: string; timestamp?: string; created_at?: string }>(items: T[], max: number) {
  const grouped = new Map<string, T[]>();
  for (const item of items) grouped.set(item.userId, [...(grouped.get(item.userId) ?? []), item]);
  return [...grouped.values()].flatMap((group) =>
    group
      .sort((a, b) => Date.parse(b.createdAt ?? b.timestamp ?? b.created_at ?? "0") - Date.parse(a.createdAt ?? a.timestamp ?? a.created_at ?? "0"))
      .slice(0, max),
  );
}

function cleanup(db: AppDatabase) {
  db.sessions = db.sessions.filter((session) => Date.parse(session.expiresAt) > Date.now());
  db.activity = trimByUser(db.activity, MAX_ACTIVITY_PER_USER);
  db.processed = trimByUser(db.processed, MAX_PROCESSED_PER_USER);
  db.copyTradeIntents = trimByUser(db.copyTradeIntents, MAX_INTENTS_PER_USER);
  db.apiHealth = db.apiHealth.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, MAX_API_HEALTH);
}

async function withDb<T>(mutator: (db: AppDatabase) => T | Promise<T>) {
  await acquireLock();
  try {
    const db = await readDbUnsafe();
    const before = JSON.stringify(db);
    const result = await mutator(db);
    cleanup(db);
    const after = JSON.stringify(db);
    if (after !== before) await writeDbStringUnsafe(JSON.stringify(db, null, 2));
    return result;
  } finally {
    await fs.unlink(lockPath()).catch(() => undefined);
  }
}

export function defaultCopySettings(userId: string, walletId: string): CopySettings {
  return {
    userId,
    walletId,
    copy_enabled: false,
    copy_mode: "alert_only",
    copy_percentage: 0,
    max_copy_amount_usdc: 0,
    min_original_trade_size: 0,
    max_original_trade_size: 0,
    allowed_markets: [],
    blocked_markets: [],
    allowed_outcomes: [],
    inverse_copy: false,
    stop_copy_after_losses: false,
    daily_max_loss_usdc: 0,
    daily_max_volume_usdc: 0,
    priority_mode: false,
    updatedAt: nowIso(),
  };
}

function defaultRiskSettings(userId: string): RiskSettings {
  const risk = getRiskConfig();
  return {
    userId,
    maxSlippageBps: risk.maxSlippageBps,
    globalDailyMaxVolumeUsdc: risk.globalDailyMaxVolumeUsdc,
    globalDailyMaxLossUsdc: risk.globalDailyMaxLossUsdc,
    maxCopyTradesPerDay: risk.maxCopyTradesPerDay,
    updatedAt: nowIso(),
  };
}

function ensureUserDefaults(db: AppDatabase, userId: string) {
  if (!db.telegramSettings.some((settings) => settings.userId === userId)) {
    db.telegramSettings.push({ userId, chatId: process.env.TELEGRAM_CHAT_ID ?? "", updatedAt: nowIso() });
  }
  if (!db.riskSettings.some((settings) => settings.userId === userId)) {
    db.riskSettings.push(defaultRiskSettings(userId));
  }
  for (const wallet of db.wallets.filter((item) => item.userId === userId)) {
    if (!db.copySettings.some((settings) => settings.userId === userId && settings.walletId === wallet.id)) {
      db.copySettings.push(defaultCopySettings(userId, wallet.id));
    }
  }
}

export async function readDatabase() {
  const db = await readDbUnsafe();
  for (const user of db.users) ensureUserDefaults(db, user.id);
  return db;
}

export async function getUserById(id: string) {
  const db = await readDbUnsafe();
  return db.users.find((user) => user.id === id);
}

export async function findUserByEmail(email: string) {
  const db = await readDbUnsafe();
  return db.users.find((user) => user.email.toLowerCase() === email.trim().toLowerCase());
}

export async function listUsers() {
  const db = await readDbUnsafe();
  return db.users.map((user) => ({ id: user.id, email: user.email, role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt }));
}

export async function createUser(email: string, password: string, role: User["role"] = "user") {
  if (!email.includes("@")) throw new Error("Valid email required");
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  return withDb(async (db) => {
    if (db.users.some((user) => user.email.toLowerCase() === email.trim().toLowerCase())) throw new Error("User already exists");
    const now = nowIso();
    const user: User = {
      id: randomUUID(),
      email: email.trim().toLowerCase(),
      passwordHash: await hashPassword(password),
      role,
      createdAt: now,
      updatedAt: now,
    };
    db.users.push(user);
    ensureUserDefaults(db, user.id);
    return { id: user.id, email: user.email, role: user.role, createdAt: user.createdAt, updatedAt: user.updatedAt };
  });
}

export async function createSession(userId: string, tokenHash: string, expiresAt: string) {
  return withDb((db) => {
    db.sessions.push({ id: randomUUID(), userId, tokenHash, expiresAt, createdAt: nowIso() });
  });
}

export async function findSessionByToken(tokenHash: string) {
  const db = await readDbUnsafe();
  return db.sessions.find((session) => session.tokenHash === tokenHash && Date.parse(session.expiresAt) > Date.now());
}

export async function removeSession(tokenHash: string) {
  return withDb((db) => {
    db.sessions = db.sessions.filter((session) => session.tokenHash !== tokenHash);
  });
}

export async function listWallets(userId: string) {
  const db = await readDbUnsafe();
  return db.wallets.filter((wallet) => wallet.userId === userId).sort((a, b) => a.label.localeCompare(b.label));
}

export async function listActiveWalletsAll() {
  const db = await readDbUnsafe();
  return db.wallets.filter((wallet) => wallet.status !== "paused");
}

export async function getWallet(userId: string, walletId: string) {
  const db = await readDbUnsafe();
  return db.wallets.find((wallet) => wallet.userId === userId && wallet.id === walletId);
}

export async function addWallet(userId: string, label: string, address: string) {
  if (!isValidWalletAddress(address)) throw new Error("Wallet address must be 0x-prefixed with 40 hex chars");
  const normalized = normalizeAddress(address);
  return withDb((db) => {
    if (db.wallets.some((wallet) => wallet.userId === userId && wallet.address === normalized)) throw new Error("Wallet already tracked");
    const now = nowIso();
    const wallet: Wallet = { id: randomUUID(), userId, label: label.trim() || "Wallet", address: normalized, status: "active", createdAt: now, updatedAt: now };
    db.wallets.push(wallet);
    db.copySettings.push(defaultCopySettings(userId, wallet.id));
    return wallet;
  });
}

export async function updateWallet(userId: string, id: string, input: { label?: string; address?: string; status?: WalletStatus }) {
  return withDb((db) => {
    const wallet = db.wallets.find((item) => item.userId === userId && item.id === id);
    if (!wallet) throw new Error("Wallet not found");
    if (input.address) {
      if (!isValidWalletAddress(input.address)) throw new Error("Wallet address must be 0x-prefixed with 40 hex chars");
      const normalized = normalizeAddress(input.address);
      if (db.wallets.some((item) => item.userId === userId && item.id !== id && item.address === normalized)) throw new Error("Wallet already tracked");
      wallet.address = normalized;
    }
    if (input.label !== undefined) wallet.label = input.label.trim() || wallet.label;
    if (input.status) wallet.status = input.status;
    wallet.updatedAt = nowIso();
    wallet.lastError = undefined;
    return wallet;
  });
}

export async function deleteWallet(userId: string, id: string) {
  return withDb((db) => {
    db.wallets = db.wallets.filter((wallet) => !(wallet.userId === userId && wallet.id === id));
    db.activity = db.activity.filter((event) => !(event.userId === userId && event.walletId === id));
    db.processed = db.processed.filter((item) => !(item.userId === userId && item.walletId === id));
    db.positions = db.positions.filter((position) => !(position.userId === userId && position.walletId === id));
    db.copySettings = db.copySettings.filter((settings) => !(settings.userId === userId && settings.walletId === id));
    db.copyTradeIntents = db.copyTradeIntents.filter((intent) => !(intent.userId === userId && intent.walletId === id));
    db.pollingState = db.pollingState.filter((state) => !(state.userId === userId && state.walletId === id));
  });
}

export async function markWalletChecked(userId: string, id: string, ok: boolean, error?: string) {
  return withDb((db) => {
    const wallet = db.wallets.find((item) => item.userId === userId && item.id === id);
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

export async function hasProcessed(userId: string, walletId: string, sourceId: string) {
  const db = await readDbUnsafe();
  return db.processed.some((item) => item.userId === userId && item.walletId === walletId && item.sourceId === sourceId);
}

export async function markProcessed(userId: string, walletId: string, sourceId: string) {
  return withDb((db) => {
    if (!db.processed.some((item) => item.userId === userId && item.walletId === walletId && item.sourceId === sourceId)) {
      db.processed.push({ id: randomUUID(), userId, walletId, sourceId, createdAt: nowIso() });
    }
  });
}

export async function saveActivity(event: Omit<ActivityEvent, "id" | "createdAt">) {
  return withDb((db) => {
    const existing = db.activity.find((item) => item.userId === event.userId && item.walletId === event.walletId && item.sourceId === event.sourceId);
    if (existing) return existing;
    const saved: ActivityEvent = { ...event, id: randomUUID(), createdAt: nowIso() };
    db.activity.unshift(saved);
    db.processed.push({ id: randomUUID(), userId: event.userId, walletId: event.walletId, sourceId: event.sourceId, createdAt: nowIso() });
    return saved;
  });
}

export async function recentActivity(userId: string, limit = 80) {
  const db = await readDbUnsafe();
  return db.activity.filter((event) => event.userId === userId).sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, limit);
}

export async function getPositionsForWallet(userId: string, walletId: string) {
  const db = await readDbUnsafe();
  return db.positions.filter((position) => position.userId === userId && position.walletId === walletId);
}

export async function replacePositionsForWallet(userId: string, walletId: string, positions: PositionSnapshot[]) {
  return withDb((db) => {
    const stable = (position: PositionSnapshot) => {
      const rest = { ...position } as Omit<PositionSnapshot, "updatedAt"> & { updatedAt?: string };
      delete rest.updatedAt;
      return rest;
    };
    const current = db.positions
      .filter((position) => position.userId === userId && position.walletId === walletId)
      .map(stable)
      .sort((a, b) => a.key.localeCompare(b.key));
    const next = positions.map(stable).sort((a, b) => a.key.localeCompare(b.key));
    if (JSON.stringify(current) === JSON.stringify(next)) return false;
    db.positions = db.positions.filter((position) => !(position.userId === userId && position.walletId === walletId)).concat(positions);
    return true;
  });
}

export async function patchCopySettings(userId: string, walletId: string, input: Partial<CopySettings>) {
  return withDb((db) => {
    let settings = db.copySettings.find((item) => item.userId === userId && item.walletId === walletId);
    if (!settings) {
      settings = defaultCopySettings(userId, walletId);
      db.copySettings.push(settings);
    }
    Object.assign(settings, input, { userId, walletId, updatedAt: nowIso() });
    if (!["alert_only", "manual_confirm", "auto_copy"].includes(settings.copy_mode)) settings.copy_mode = "alert_only";
    settings.copy_enabled = Boolean(settings.copy_enabled);
    settings.inverse_copy = Boolean(settings.inverse_copy);
    settings.stop_copy_after_losses = Boolean(settings.stop_copy_after_losses);
    settings.priority_mode = Boolean(settings.priority_mode);
    settings.allowed_markets = Array.isArray(settings.allowed_markets) ? settings.allowed_markets.map(String).slice(0, 50) : [];
    settings.blocked_markets = Array.isArray(settings.blocked_markets) ? settings.blocked_markets.map(String).slice(0, 50) : [];
    settings.allowed_outcomes = Array.isArray(settings.allowed_outcomes) ? settings.allowed_outcomes.map(String).slice(0, 20) : [];
    settings.copy_percentage = Math.max(0, Math.min(100, Number(settings.copy_percentage) || 0));
    settings.max_copy_amount_usdc = Math.max(0, Number(settings.max_copy_amount_usdc) || 0);
    settings.min_original_trade_size = Math.max(0, Number(settings.min_original_trade_size) || 0);
    settings.max_original_trade_size = Math.max(0, Number(settings.max_original_trade_size) || 0);
    settings.daily_max_loss_usdc = Math.max(0, Number(settings.daily_max_loss_usdc) || 0);
    settings.daily_max_volume_usdc = Math.max(0, Number(settings.daily_max_volume_usdc) || 0);
    return settings;
  });
}

export async function getCopySettings(userId: string, walletId: string) {
  const db = await readDbUnsafe();
  return db.copySettings.find((item) => item.userId === userId && item.walletId === walletId) ?? defaultCopySettings(userId, walletId);
}

export async function saveCopyIntent(intent: Omit<CopyTradeIntent, "id" | "created_at">) {
  return withDb((db) => {
    const saved: CopyTradeIntent = { ...intent, id: randomUUID(), created_at: nowIso() };
    db.copyTradeIntents.unshift(saved);
    return saved;
  });
}

export async function listCopyIntents(userId: string, limit = 120) {
  const db = await readDbUnsafe();
  return db.copyTradeIntents.filter((intent) => intent.userId === userId).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, limit);
}

export async function updateCopyIntent(userId: string, id: string, patch: Partial<CopyTradeIntent>) {
  return withDb((db) => {
    const intent = db.copyTradeIntents.find((item) => item.userId === userId && item.id === id);
    if (!intent) throw new Error("Trade intent not found");
    Object.assign(intent, patch);
    return intent;
  });
}

export async function getTelegramSettings(userId: string) {
  const db = await readDbUnsafe();
  return db.telegramSettings.find((settings) => settings.userId === userId) ?? { userId, chatId: "", updatedAt: nowIso() };
}

export async function updateTelegramSettings(userId: string, chatId: string) {
  return withDb((db) => {
    let settings = db.telegramSettings.find((item) => item.userId === userId);
    if (!settings) {
      settings = { userId, chatId: "", updatedAt: nowIso() };
      db.telegramSettings.push(settings);
    }
    settings.chatId = chatId.trim();
    settings.updatedAt = nowIso();
    return settings;
  });
}

export async function getRiskSettings(userId: string) {
  const db = await readDbUnsafe();
  return db.riskSettings.find((settings) => settings.userId === userId) ?? defaultRiskSettings(userId);
}

export async function getPollingState(userId: string, walletId: string) {
  const db = await readDbUnsafe();
  return db.pollingState.find((state) => state.userId === userId && state.walletId === walletId);
}

export async function upsertPollingState(userId: string, walletId: string, patch: Partial<PollingState>) {
  return withDb((db) => {
    let state = db.pollingState.find((item) => item.userId === userId && item.walletId === walletId);
    if (!state) {
      state = { userId, walletId, mode: "normal", recent_activity_count: 0, failureCount: 0 };
      db.pollingState.push(state);
    }
    Object.assign(state, patch, { userId, walletId });
    return state;
  });
}

export async function listPollingState(userId: string) {
  const db = await readDbUnsafe();
  return db.pollingState.filter((state) => state.userId === userId);
}

export async function saveApiHealth(sample: Omit<ApiHealthSample, "id" | "createdAt">) {
  return withDb((db) => {
    db.apiHealth.unshift({ ...sample, id: randomUUID(), createdAt: nowIso() });
  });
}

export async function listApiHealth(limit = 80) {
  const db = await readDbUnsafe();
  return db.apiHealth.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
}
