import { getPublicConfig } from "./config";
import {
  getRiskSettings,
  getTelegramSettings,
  listApiHealth,
  listCopyIntents,
  listPollingState,
  listWallets,
  readDatabase,
  recentActivity,
} from "./storage";
import type {
  ActivityEvent,
  ApiHealthSample,
  CopySettings,
  CopyTradeIntent,
  PollingState,
  PositionSnapshot,
  RiskSettings,
  SystemState,
  TelegramSettings,
  User,
  Wallet,
} from "./types";

export type SafeUser = { id: string; email: string; role: "admin" | "user" };

export type DashboardPayload = {
  user: SafeUser;
  wallets: Wallet[];
  activity: ActivityEvent[];
  copySettings: CopySettings[];
  copyTradeIntents: CopyTradeIntent[];
  positions: PositionSnapshot[];
  pollingState: PollingState[];
  apiHealth: ApiHealthSample[];
  telegramSettings: TelegramSettings;
  riskSettings: RiskSettings;
  system: SystemState;
  config: {
    pollIntervalSeconds: number;
    telegramConfigured: boolean;
    storagePath: string;
    autoTradingEnabled: boolean;
    dryRun: boolean;
  };
};

export async function getDashboardPayload(user: User): Promise<DashboardPayload> {
  const db = await readDatabase();
  return {
    user: { id: user.id, email: user.email, role: user.role },
    wallets: await listWallets(user.id),
    activity: await recentActivity(user.id, 80),
    copySettings: db.copySettings.filter((settings) => settings.userId === user.id),
    copyTradeIntents: await listCopyIntents(user.id, 120),
    positions: db.positions.filter((position) => position.userId === user.id),
    pollingState: await listPollingState(user.id),
    apiHealth: await listApiHealth(80),
    telegramSettings: await getTelegramSettings(user.id),
    riskSettings: await getRiskSettings(user.id),
    system: db.system,
    config: getPublicConfig(),
  };
}
