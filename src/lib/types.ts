export type WalletStatus = "active" | "paused" | "error";
export type CopyMode = "alert_only" | "manual_confirm" | "auto_copy";
export type IntentStatus = "pending" | "confirmed" | "rejected" | "executed" | "failed" | "blocked" | "dry_run";
export type PollingMode = "idle" | "normal" | "high_priority" | "burst" | "cooldown";
export type PositionStatus = "opening" | "increasing" | "reducing" | "closing" | "closed";

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  role: "admin" | "user";
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
};

export type Wallet = {
  id: string;
  userId: string;
  label: string;
  address: string;
  status: WalletStatus;
  createdAt: string;
  updatedAt: string;
  lastCheckedAt?: string;
  lastError?: string;
};

export type ActivityAction =
  | "NEW_BET"
  | "BUY_FILLED"
  | "SELL_FILLED"
  | "POSITION_CLOSED"
  | "PNL_REALIZED";

export type ActivityEvent = {
  id: string;
  userId: string;
  walletId: string;
  walletLabel: string;
  address: string;
  sourceId: string;
  action: ActivityAction;
  positionStatus?: PositionStatus;
  marketTitle: string;
  conditionId?: string;
  asset?: string;
  outcome?: string;
  side?: "BUY" | "SELL";
  size?: number;
  price?: number;
  amountUsd?: number;
  txHash?: string;
  timestamp: string;
  pnl?: number;
  previousAvgPrice?: number;
  currentAvgPrice?: number;
  avgPriceChange?: number;
  avgPriceChangeDirection?: "increased" | "decreased" | "unchanged";
  positionBefore?: number;
  positionAfter?: number;
  positionChange?: number;
  createdAt: string;
  notifiedAt?: string;
};

export type PositionSnapshot = {
  userId: string;
  walletId: string;
  key: string;
  asset: string;
  conditionId: string;
  marketTitle: string;
  outcome?: string;
  size: number;
  avgPrice?: number;
  previousAvgPrice?: number;
  avgPriceChange?: number;
  avgPriceChangeDirection?: "increased" | "decreased" | "unchanged";
  latestTradePrice?: number;
  totalBought?: number;
  totalSold?: number;
  currentValue?: number;
  cashPnl?: number;
  realizedPnl?: number;
  curPrice?: number;
  status: PositionStatus;
  updatedAt: string;
};

export type ProcessedItem = {
  id: string;
  userId: string;
  walletId: string;
  sourceId: string;
  createdAt: string;
};

export type CopySettings = {
  userId: string;
  walletId: string;
  copy_enabled: boolean;
  copy_mode: CopyMode;
  copy_percentage: number;
  max_copy_amount_usdc: number;
  min_original_trade_size: number;
  max_original_trade_size: number;
  allowed_markets: string[];
  blocked_markets: string[];
  allowed_outcomes: string[];
  inverse_copy: boolean;
  stop_copy_after_losses: boolean;
  daily_max_loss_usdc: number;
  daily_max_volume_usdc: number;
  priority_mode: boolean;
  updatedAt: string;
};

export type CopyTradeIntent = {
  id: string;
  userId: string;
  walletId: string;
  source_wallet: string;
  source_trade: ActivityEvent;
  copied_amount: number;
  original_amount: number;
  market: string;
  outcome?: string;
  side?: "BUY" | "SELL";
  status: IntentStatus;
  reason: string;
  source_previous_avg_price?: number;
  source_new_avg_price?: number;
  source_avg_price_change?: number;
  source_position_before?: number;
  source_position_after?: number;
  created_at: string;
  executed_at?: string;
};

export type TelegramSettings = {
  userId: string;
  chatId: string;
  updatedAt: string;
};

export type RiskSettings = {
  userId: string;
  maxSlippageBps: number;
  globalDailyMaxVolumeUsdc: number;
  globalDailyMaxLossUsdc: number;
  maxCopyTradesPerDay: number;
  updatedAt: string;
};

export type PollingState = {
  userId: string;
  walletId: string;
  mode: PollingMode;
  previousMode?: PollingMode;
  burstUntil?: string;
  last_activity_at?: string;
  last_poll_at?: string;
  next_poll_at?: string;
  recent_activity_count: number;
  api_latency?: number;
  failureCount: number;
  lastError?: string;
};

export type ApiHealthSample = {
  id: string;
  endpoint: string;
  ok: boolean;
  status?: number;
  latencyMs: number;
  error?: string;
  createdAt: string;
};

export type SystemState = {
  lastPollStartedAt?: string;
  lastPollCompletedAt?: string;
  lastError?: string;
  pollCount: number;
  running: boolean;
};

export type AppDatabase = {
  schemaVersion: number;
  users: User[];
  sessions: Session[];
  wallets: Wallet[];
  activity: ActivityEvent[];
  processed: ProcessedItem[];
  positions: PositionSnapshot[];
  copySettings: CopySettings[];
  copyTradeIntents: CopyTradeIntent[];
  telegramSettings: TelegramSettings[];
  riskSettings: RiskSettings[];
  pollingState: PollingState[];
  apiHealth: ApiHealthSample[];
  system: SystemState;
};

export type PolymarketActivity = {
  proxyWallet: string;
  timestamp: number;
  conditionId: string;
  type: "TRADE" | "SPLIT" | "MERGE" | "REDEEM" | "REWARD" | "CONVERSION" | "MAKER_REBATE" | "REFERRAL_REWARD";
  size?: number;
  usdcSize?: number;
  transactionHash?: string;
  price?: number;
  asset?: string;
  side?: "BUY" | "SELL";
  outcomeIndex?: number;
  title?: string;
  slug?: string;
  icon?: string;
  eventSlug?: string;
  outcome?: string;
};

export type PolymarketPosition = {
  proxyWallet: string;
  asset: string;
  conditionId: string;
  size?: number;
  avgPrice?: number;
  initialValue?: number;
  currentValue?: number;
  cashPnl?: number;
  percentPnl?: number;
  totalBought?: number;
  realizedPnl?: number;
  percentRealizedPnl?: number;
  curPrice?: number;
  title?: string;
  slug?: string;
  icon?: string;
  eventSlug?: string;
  outcome?: string;
  outcomeIndex?: number;
  oppositeOutcome?: string;
  oppositeAsset?: string;
  endDate?: string;
  timestamp?: number;
};

export type CheckResult = {
  walletId: string;
  label: string;
  ok: boolean;
  newEvents: number;
  message?: string;
};
