export type WalletStatus = "active" | "paused" | "error";

export type Wallet = {
  id: string;
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
  walletId: string;
  walletLabel: string;
  address: string;
  sourceId: string;
  action: ActivityAction;
  marketTitle: string;
  outcome?: string;
  side?: "BUY" | "SELL";
  size?: number;
  price?: number;
  amountUsd?: number;
  txHash?: string;
  timestamp: string;
  pnl?: number;
  createdAt: string;
  notifiedAt?: string;
};

export type PositionSnapshot = {
  walletId: string;
  key: string;
  asset: string;
  conditionId: string;
  marketTitle: string;
  outcome?: string;
  size: number;
  avgPrice?: number;
  currentValue?: number;
  cashPnl?: number;
  realizedPnl?: number;
  curPrice?: number;
  updatedAt: string;
};

export type ProcessedItem = {
  id: string;
  walletId: string;
  sourceId: string;
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
  wallets: Wallet[];
  activity: ActivityEvent[];
  processed: ProcessedItem[];
  positions: PositionSnapshot[];
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
