"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  CheckCircle2,
  CirclePause,
  Clock3,
  LogOut,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Save,
  Send,
  Shield,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  WalletCards,
  X,
} from "lucide-react";
import type {
  ActivityEvent,
  ApiHealthSample,
  CopyMode,
  CopySettings,
  CopyTradeIntent,
  PollingState,
  PositionSnapshot,
  RiskSettings,
  SystemState,
  TelegramSettings,
  Wallet,
} from "@/lib/types";

type SafeUser = { id: string; email: string; role: "admin" | "user" };

type DashboardPayload = {
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

const emptyPayload: DashboardPayload = {
  user: { id: "", email: "", role: "user" },
  wallets: [],
  activity: [],
  copySettings: [],
  copyTradeIntents: [],
  positions: [],
  pollingState: [],
  apiHealth: [],
  telegramSettings: { userId: "", chatId: "", updatedAt: "" },
  riskSettings: { userId: "", maxSlippageBps: 100, globalDailyMaxVolumeUsdc: 0, globalDailyMaxLossUsdc: 0, maxCopyTradesPerDay: 0, updatedAt: "" },
  system: { pollCount: 0, running: false },
  config: { pollIntervalSeconds: 15, telegramConfigured: false, storagePath: ".data/polywatch.json", autoTradingEnabled: false, dryRun: true },
};

function formatDate(value?: string) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function compactAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function money(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "n/a";
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function numberValue(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return "n/a";
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function csv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

function Badge({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "green" | "amber" | "red" | "blue" }) {
  const tones = {
    zinc: "border-zinc-200 bg-zinc-50 text-zinc-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-sky-200 bg-sky-50 text-sky-700",
  };
  return <span className={`inline-flex rounded-md border px-2 py-1 text-[11px] font-semibold ${tones[tone]}`}>{children}</span>;
}

function modeTone(mode?: CopyMode) {
  if (mode === "auto_copy") return "red" as const;
  if (mode === "manual_confirm") return "amber" as const;
  return "zinc" as const;
}

function statusTone(status: CopyTradeIntent["status"]) {
  if (status === "executed" || status === "confirmed") return "green" as const;
  if (status === "pending" || status === "dry_run") return "amber" as const;
  if (status === "blocked" || status === "failed" || status === "rejected") return "red" as const;
  return "zinc" as const;
}

function ActionBadge({ event }: { event: ActivityEvent }) {
  const sell = event.side === "SELL" || event.action === "POSITION_CLOSED";
  const tone = sell ? "amber" : event.action === "PNL_REALIZED" ? "green" : "blue";
  return <Badge tone={tone}>{event.side ?? event.action.replaceAll("_", " ")}</Badge>;
}

function WalletEditor({ wallet, onDone, onCancel }: { wallet: Wallet; onDone: () => void; onCancel: () => void }) {
  const [label, setLabel] = useState(wallet.label);
  const [address, setAddress] = useState(wallet.address);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await requestJson(`/api/wallets/${wallet.id}`, { method: "PATCH", body: JSON.stringify({ label, address }) });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 border-t border-zinc-200 pt-3 md:grid-cols-[140px_1fr_auto]">
      <label className="grid gap-1 text-xs font-medium text-zinc-600">
        Label
        <input className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950 outline-none focus:border-emerald-500" value={label} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-zinc-600">
        Address
        <input className="h-10 rounded-md border border-zinc-300 px-3 font-mono text-sm text-zinc-950 outline-none focus:border-emerald-500" value={address} onChange={(event) => setAddress(event.target.value)} />
      </label>
      <div className="flex items-end gap-2">
        <button className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={saving} type="submit">
          <CheckCircle2 size={16} /> Save
        </button>
        <button className="inline-flex h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-semibold text-zinc-700" type="button" onClick={onCancel} aria-label="Cancel edit">
          <X size={16} />
        </button>
      </div>
      {error ? <p className="text-sm text-red-700 md:col-span-3">{error}</p> : null}
    </form>
  );
}

function CopySettingsPanel({
  wallet,
  settings,
  onSaved,
}: {
  wallet: Wallet;
  settings?: CopySettings;
  onSaved: () => void;
}) {
  const [form, setForm] = useState(() => ({
    copy_enabled: settings?.copy_enabled ?? false,
    copy_mode: settings?.copy_mode ?? "alert_only",
    copy_percentage: settings?.copy_percentage ?? 0,
    max_copy_amount_usdc: settings?.max_copy_amount_usdc ?? 0,
    min_original_trade_size: settings?.min_original_trade_size ?? 0,
    max_original_trade_size: settings?.max_original_trade_size ?? 0,
    allowed_markets: (settings?.allowed_markets ?? []).join(", "),
    blocked_markets: (settings?.blocked_markets ?? []).join(", "),
    allowed_outcomes: (settings?.allowed_outcomes ?? []).join(", "),
    inverse_copy: settings?.inverse_copy ?? false,
    stop_copy_after_losses: settings?.stop_copy_after_losses ?? false,
    daily_max_loss_usdc: settings?.daily_max_loss_usdc ?? 0,
    daily_max_volume_usdc: settings?.daily_max_volume_usdc ?? 0,
    priority_mode: settings?.priority_mode ?? false,
  }));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await requestJson(`/api/wallets/${wallet.id}/copy-settings`, {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          allowed_markets: csv(form.allowed_markets),
          blocked_markets: csv(form.blocked_markets),
          allowed_outcomes: csv(form.allowed_outcomes),
        }),
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={18} />
          <h2 className="text-base font-semibold">Copy Trading Settings</h2>
        </div>
        <Badge tone={modeTone(form.copy_mode as CopyMode)}>{String(form.copy_mode).replaceAll("_", " ")}</Badge>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input type="checkbox" checked={form.copy_enabled} onChange={(event) => setForm({ ...form, copy_enabled: event.target.checked })} />
          Copy enabled
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Mode
          <select className="h-10 rounded-md border border-zinc-300 px-3 text-sm" value={form.copy_mode} onChange={(event) => setForm({ ...form, copy_mode: event.target.value as CopyMode })}>
            <option value="alert_only">Alert only</option>
            <option value="manual_confirm">Manual confirm</option>
            <option value="auto_copy">Auto copy</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Copy %
          <input className="h-10 rounded-md border border-zinc-300 px-3 text-sm" type="number" min="0" max="100" value={form.copy_percentage} onChange={(event) => setForm({ ...form, copy_percentage: Number(event.target.value) })} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Max copy USDC
          <input className="h-10 rounded-md border border-zinc-300 px-3 text-sm" type="number" min="0" value={form.max_copy_amount_usdc} onChange={(event) => setForm({ ...form, max_copy_amount_usdc: Number(event.target.value) })} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Min original USDC
          <input className="h-10 rounded-md border border-zinc-300 px-3 text-sm" type="number" min="0" value={form.min_original_trade_size} onChange={(event) => setForm({ ...form, min_original_trade_size: Number(event.target.value) })} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Max original USDC
          <input className="h-10 rounded-md border border-zinc-300 px-3 text-sm" type="number" min="0" value={form.max_original_trade_size} onChange={(event) => setForm({ ...form, max_original_trade_size: Number(event.target.value) })} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600 md:col-span-2">
          Allowed markets
          <input className="h-10 rounded-md border border-zinc-300 px-3 text-sm" value={form.allowed_markets} onChange={(event) => setForm({ ...form, allowed_markets: event.target.value })} placeholder="comma separated, empty allows all" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600 md:col-span-2">
          Blocked markets
          <input className="h-10 rounded-md border border-zinc-300 px-3 text-sm" value={form.blocked_markets} onChange={(event) => setForm({ ...form, blocked_markets: event.target.value })} placeholder="comma separated" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Allowed outcomes
          <input className="h-10 rounded-md border border-zinc-300 px-3 text-sm" value={form.allowed_outcomes} onChange={(event) => setForm({ ...form, allowed_outcomes: event.target.value })} placeholder="YES, NO" />
        </label>
        <label className="grid gap-1 text-xs font-medium text-zinc-600">
          Daily volume cap
          <input className="h-10 rounded-md border border-zinc-300 px-3 text-sm" type="number" min="0" value={form.daily_max_volume_usdc} onChange={(event) => setForm({ ...form, daily_max_volume_usdc: Number(event.target.value) })} />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input type="checkbox" checked={form.inverse_copy} onChange={(event) => setForm({ ...form, inverse_copy: event.target.checked })} />
          Inverse copy
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700">
          <input type="checkbox" checked={form.priority_mode} onChange={(event) => setForm({ ...form, priority_mode: event.target.checked })} />
          Priority polling
        </label>
      </div>
      <button onClick={save} disabled={saving} className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-50">
        <Save size={16} /> Save Settings
      </button>
    </section>
  );
}

export function Dashboard() {
  const [data, setData] = useState<DashboardPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const [positionFilter, setPositionFilter] = useState("active");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [newUser, setNewUser] = useState({ email: "", password: "", role: "user" });
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const selectedWallet = data.wallets.find((wallet) => wallet.id === selectedWalletId) ?? data.wallets[0];
  const selectedSettings = selectedWallet ? data.copySettings.find((settings) => settings.walletId === selectedWallet.id) : undefined;
  const activeWallets = useMemo(() => data.wallets.filter((wallet) => wallet.status === "active").length, [data.wallets]);

  const positions = useMemo(() => {
    if (!selectedWallet) return [];
    return data.positions
      .filter((position) => position.walletId === selectedWallet.id)
      .filter((position) => (positionFilter === "active" ? position.status !== "closed" && position.size > 0 : positionFilter === "closed" ? position.status === "closed" || position.size <= 0 : true));
  }, [data.positions, positionFilter, selectedWallet]);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      const payload = await requestJson<DashboardPayload>("/api/dashboard");
      setData(payload);
      setTelegramChatId(payload.telegramSettings.chatId);
      if (!selectedWalletId && payload.wallets[0]) setSelectedWalletId(payload.wallets[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    const id = setInterval(() => void load(true), 10000);
    return () => {
      window.clearTimeout(initial);
      clearInterval(id);
    };
    // Dashboard polling intentionally owns its own cadence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function add(event: FormEvent) {
    event.preventDefault();
    setBusy("add");
    setNotice(null);
    try {
      await requestJson("/api/wallets", { method: "POST", body: JSON.stringify({ label, address }) });
      setLabel("");
      setAddress("");
      setNotice({ tone: "success", text: "Wallet added. First check seeds baseline without old alerts." });
      await load(true);
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy("");
    }
  }

  async function patchWallet(wallet: Wallet, patch: Partial<Wallet>) {
    setBusy(wallet.id);
    try {
      await requestJson(`/api/wallets/${wallet.id}`, { method: "PATCH", body: JSON.stringify(patch) });
      await load(true);
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy("");
    }
  }

  async function removeWallet(wallet: Wallet) {
    setBusy(wallet.id);
    try {
      await requestJson(`/api/wallets/${wallet.id}`, { method: "DELETE" });
      if (selectedWalletId === wallet.id) setSelectedWalletId(null);
      await load(true);
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy("");
    }
  }

  async function checkNow() {
    setBusy("check");
    setNotice(null);
    try {
      const result = await requestJson<{ results: { newEvents: number }[] }>("/api/check-now", { method: "POST" });
      const count = result.results.reduce((sum, item) => sum + item.newEvents, 0);
      setNotice({ tone: "success", text: `Check complete. ${count} new event${count === 1 ? "" : "s"}.` });
      await load(true);
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy("");
    }
  }

  async function testTelegram() {
    setBusy("telegram");
    setNotice(null);
    try {
      await requestJson("/api/telegram/test", { method: "POST" });
      setNotice({ tone: "success", text: "Telegram test sent." });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy("");
    }
  }

  async function saveTelegram(event: FormEvent) {
    event.preventDefault();
    setBusy("telegram-settings");
    try {
      await requestJson("/api/settings/telegram", { method: "PATCH", body: JSON.stringify({ chatId: telegramChatId }) });
      setNotice({ tone: "success", text: "Telegram chat saved." });
      await load(true);
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy("");
    }
  }

  async function logout() {
    await requestJson("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    setBusy("create-user");
    try {
      await requestJson("/api/admin/users", { method: "POST", body: JSON.stringify(newUser) });
      setNewUser({ email: "", password: "", role: "user" });
      setNotice({ tone: "success", text: "User created." });
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy("");
    }
  }

  async function updateIntent(id: string, action: "confirm" | "reject") {
    setBusy(id);
    try {
      await requestJson(`/api/copy/intents/${id}/${action}`, { method: "POST" });
      await load(true);
    } catch (err) {
      setNotice({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy("");
    }
  }

  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <header className="border-b border-zinc-200">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-emerald-600 text-white">
              <Activity size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-normal">PolyWatch</h1>
              <p className="text-sm text-zinc-600">{activeWallets} active wallet{activeWallets === 1 ? "" : "s"} - {data.config.dryRun ? "dry run" : "live"} mode</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={checkNow} disabled={busy === "check"} className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-50">
              <RefreshCw size={16} className={busy === "check" ? "animate-spin" : ""} /> Check Now
            </button>
            <button onClick={testTelegram} disabled={busy === "telegram"} className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 disabled:opacity-50">
              <Send size={16} /> Telegram Test
            </button>
            <button onClick={logout} className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800">
              <LogOut size={16} /> Logout
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl gap-4 px-4 py-5 sm:px-6 lg:grid-cols-[360px_1fr] lg:px-8">
        <aside className="space-y-4">
          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <WalletCards size={18} />
              <h2 className="text-base font-semibold">Wallets</h2>
            </div>
            <form onSubmit={add} className="space-y-3">
              <label className="grid gap-1 text-xs font-medium text-zinc-600">
                Label
                <input className="h-10 rounded-md border border-zinc-300 px-3 text-sm text-zinc-950 outline-none focus:border-emerald-500" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Whale 1" />
              </label>
              <label className="grid gap-1 text-xs font-medium text-zinc-600">
                Address
                <input className="h-10 rounded-md border border-zinc-300 px-3 font-mono text-sm text-zinc-950 outline-none focus:border-emerald-500" value={address} onChange={(event) => setAddress(event.target.value)} placeholder="0x..." />
              </label>
              <button className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50" disabled={busy === "add"} type="submit">
                <Plus size={16} /> Add Wallet
              </button>
            </form>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Clock3 size={18} />
              <h2 className="text-base font-semibold">System</h2>
            </div>
            <dl className="grid gap-3 text-sm">
              <div className="flex items-center justify-between gap-4"><dt className="text-zinc-600">User</dt><dd className="font-medium">{data.user.email}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-zinc-600">Polling</dt><dd className="font-medium">{data.system.running ? "Running" : "Idle"}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-zinc-600">Last poll</dt><dd className="font-medium">{formatDate(data.system.lastPollCompletedAt)}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-zinc-600">Bot env</dt><dd>{data.config.telegramConfigured ? <Badge tone="green">Ready</Badge> : <Badge tone="amber">Missing</Badge>}</dd></div>
              <div className="flex items-center justify-between gap-4"><dt className="text-zinc-600">Auto trading</dt><dd>{data.config.autoTradingEnabled ? <Badge tone="red">Enabled</Badge> : <Badge>Off</Badge>}</dd></div>
            </dl>
            {data.system.lastError ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{data.system.lastError}</p> : null}
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
              <Bell size={18} />
              <h2 className="text-base font-semibold">Telegram</h2>
            </div>
            <form onSubmit={saveTelegram} className="space-y-3">
              <label className="grid gap-1 text-xs font-medium text-zinc-600">
                Chat ID
                <input className="h-10 rounded-md border border-zinc-300 px-3 text-sm" value={telegramChatId} onChange={(event) => setTelegramChatId(event.target.value)} placeholder="211721443" />
              </label>
              <button className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold" disabled={busy === "telegram-settings"}>
                <Save size={16} /> Save Chat
              </button>
            </form>
          </section>

          {data.user.role === "admin" ? (
            <section className="rounded-lg border border-zinc-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <UserPlus size={18} />
                <h2 className="text-base font-semibold">Admin Users</h2>
              </div>
              <form onSubmit={createUser} className="space-y-3">
                <input className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm" value={newUser.email} onChange={(event) => setNewUser({ ...newUser, email: event.target.value })} placeholder="user@email.com" />
                <input className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm" type="password" value={newUser.password} onChange={(event) => setNewUser({ ...newUser, password: event.target.value })} placeholder="password" />
                <select className="h-10 w-full rounded-md border border-zinc-300 px-3 text-sm" value={newUser.role} onChange={(event) => setNewUser({ ...newUser, role: event.target.value })}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
                <button className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white" disabled={busy === "create-user"}>
                  <UserPlus size={16} /> Create User
                </button>
              </form>
            </section>
          ) : null}
        </aside>

        <div className="space-y-4">
          {(notice || error) && (
            <div className={`rounded-lg border px-4 py-3 text-sm ${error || notice?.tone === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`} role="status">
              {error || notice?.text}
            </div>
          )}

          <section className="rounded-lg border border-zinc-200 bg-white">
            <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
              <h2 className="text-base font-semibold">Tracked Wallets</h2>
              {loading ? <span className="text-sm text-zinc-500">Loading</span> : null}
            </div>
            <div className="divide-y divide-zinc-200">
              {data.wallets.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-zinc-600">No wallets tracked.</div>
              ) : (
                data.wallets.map((wallet) => {
                  const settings = data.copySettings.find((item) => item.walletId === wallet.id);
                  const polling = data.pollingState.find((item) => item.walletId === wallet.id);
                  return (
                    <div key={wallet.id} className={`p-4 ${selectedWallet?.id === wallet.id ? "bg-emerald-50/40" : ""}`}>
                      <button className="w-full text-left" onClick={() => setSelectedWalletId(wallet.id)}>
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="truncate text-sm font-semibold">{wallet.label}</h3>
                              <Badge tone={wallet.status === "active" ? "green" : wallet.status === "paused" ? "amber" : "red"}>{wallet.status}</Badge>
                              <Badge tone={modeTone(settings?.copy_mode)}>{settings?.copy_mode?.replaceAll("_", " ") ?? "alert only"}</Badge>
                              <Badge tone={polling?.mode === "burst" ? "amber" : polling?.mode === "high_priority" ? "blue" : "zinc"}>{polling?.mode ?? "normal"}</Badge>
                            </div>
                            <p className="mt-1 font-mono text-xs text-zinc-600">{compactAddress(wallet.address)}</p>
                            <p className="mt-1 text-xs text-zinc-500">Checked {formatDate(wallet.lastCheckedAt)} - latency {polling?.api_latency ? `${polling.api_latency}ms` : "n/a"}</p>
                            {wallet.lastError ? <p className="mt-1 text-xs text-red-700">{wallet.lastError}</p> : null}
                          </div>
                        </div>
                      </button>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800" onClick={() => setEditingId(wallet.id)}>
                          <Pencil size={15} /> Edit
                        </button>
                        <button className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 disabled:opacity-50" disabled={busy === wallet.id} onClick={() => patchWallet(wallet, { status: wallet.status === "paused" ? "active" : "paused" })}>
                          {wallet.status === "paused" ? <Play size={15} /> : <CirclePause size={15} />}
                          {wallet.status === "paused" ? "Resume" : "Pause"}
                        </button>
                        <button className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 px-3 text-sm font-medium text-red-700 disabled:opacity-50" disabled={busy === wallet.id} onClick={() => removeWallet(wallet)}>
                          <Trash2 size={15} /> Delete
                        </button>
                      </div>
                      {editingId === wallet.id ? <WalletEditor wallet={wallet} onDone={() => { setEditingId(null); void load(true); }} onCancel={() => setEditingId(null)} /> : null}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {selectedWallet ? <CopySettingsPanel key={selectedWallet.id} wallet={selectedWallet} settings={selectedSettings} onSaved={() => void load(true)} /> : null}

          {selectedWallet ? (
            <section className="rounded-lg border border-zinc-200 bg-white">
              <div className="flex flex-col gap-3 border-b border-zinc-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <h2 className="text-base font-semibold">{selectedWallet.label} Positions</h2>
                <select className="h-9 rounded-md border border-zinc-300 px-3 text-sm" value={positionFilter} onChange={(event) => setPositionFilter(event.target.value)}>
                  <option value="active">Active</option>
                  <option value="closed">Closed</option>
                  <option value="all">All</option>
                </select>
              </div>
              <div className="overflow-x-auto">
                {positions.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-zinc-600">No matching positions.</div>
                ) : (
                  <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                      <tr>
                        <th className="px-4 py-3">Market</th>
                        <th className="px-4 py-3">Outcome</th>
                        <th className="px-4 py-3">Size</th>
                        <th className="px-4 py-3">Avg</th>
                        <th className="px-4 py-3">Latest</th>
                        <th className="px-4 py-3">Bought</th>
                        <th className="px-4 py-3">Sold</th>
                        <th className="px-4 py-3">PnL</th>
                        <th className="px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200">
                      {positions.map((position) => (
                        <tr key={position.key}>
                          <td className="max-w-sm px-4 py-3">{position.marketTitle}</td>
                          <td className="px-4 py-3">{position.outcome ?? "n/a"}</td>
                          <td className="px-4 py-3">{numberValue(position.size)}</td>
                          <td className="px-4 py-3">{numberValue(position.avgPrice)}</td>
                          <td className="px-4 py-3">{numberValue(position.latestTradePrice ?? position.curPrice)}</td>
                          <td className="px-4 py-3">{numberValue(position.totalBought)}</td>
                          <td className="px-4 py-3">{numberValue(position.totalSold)}</td>
                          <td className="px-4 py-3">{money(position.realizedPnl ?? position.cashPnl)}</td>
                          <td className="px-4 py-3"><Badge>{position.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          ) : null}

          <section className="rounded-lg border border-zinc-200 bg-white">
            <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
              <Shield size={18} />
              <h2 className="text-base font-semibold">Copy Trade Intents</h2>
            </div>
            <div className="overflow-x-auto">
              {data.copyTradeIntents.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-zinc-600">No copy trade intents yet.</div>
              ) : (
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Wallet</th>
                      <th className="px-4 py-3">Market</th>
                      <th className="px-4 py-3">Side</th>
                      <th className="px-4 py-3">Copy</th>
                      <th className="px-4 py-3">Avg Context</th>
                      <th className="px-4 py-3">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {data.copyTradeIntents.map((intent) => (
                      <tr key={intent.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{formatDate(intent.created_at)}</td>
                        <td className="px-4 py-3"><Badge tone={statusTone(intent.status)}>{intent.status}</Badge></td>
                        <td className="px-4 py-3">{intent.source_wallet}</td>
                        <td className="max-w-sm px-4 py-3">{intent.market}<p className="mt-1 text-xs text-zinc-500">{intent.reason}</p></td>
                        <td className="px-4 py-3">{intent.side ?? "n/a"} {intent.outcome ?? ""}</td>
                        <td className="px-4 py-3">{money(intent.copied_amount)}</td>
                        <td className="px-4 py-3 text-xs text-zinc-600">Avg {numberValue(intent.source_previous_avg_price)} to {numberValue(intent.source_new_avg_price)}<br />Pos {numberValue(intent.source_position_before)} to {numberValue(intent.source_position_after)}</td>
                        <td className="px-4 py-3">
                          {intent.status === "pending" ? (
                            <div className="flex gap-2">
                              <button className="h-8 rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white" onClick={() => updateIntent(intent.id, "confirm")} disabled={busy === intent.id}>Confirm</button>
                              <button className="h-8 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-700" onClick={() => updateIntent(intent.id, "reject")} disabled={busy === intent.id}>Reject</button>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-500">{formatDate(intent.executed_at)}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-zinc-200 bg-white">
            <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3">
              <Bell size={18} />
              <h2 className="text-base font-semibold">Recent Activity</h2>
            </div>
            <div className="overflow-x-auto">
              {data.activity.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-zinc-600">No detected activity yet.</div>
              ) : (
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">Time</th>
                      <th className="px-4 py-3">Wallet</th>
                      <th className="px-4 py-3">Action</th>
                      <th className="px-4 py-3">Market</th>
                      <th className="px-4 py-3">Size</th>
                      <th className="px-4 py-3">Price</th>
                      <th className="px-4 py-3">Avg</th>
                      <th className="px-4 py-3">Position</th>
                      <th className="px-4 py-3">Tx</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {data.activity.map((event) => (
                      <tr key={event.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{formatDate(event.timestamp)}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium">{event.walletLabel}</td>
                        <td className="px-4 py-3"><ActionBadge event={event} /><p className="mt-1 text-xs text-zinc-500">{event.positionStatus}</p></td>
                        <td className="max-w-sm px-4 py-3">{event.marketTitle}<p className="mt-1 text-xs text-zinc-500">{event.outcome ?? "n/a"}</p></td>
                        <td className="whitespace-nowrap px-4 py-3">{numberValue(event.size)}</td>
                        <td className="whitespace-nowrap px-4 py-3">{numberValue(event.price)}</td>
                        <td className="whitespace-nowrap px-4 py-3">{numberValue(event.previousAvgPrice)} to {numberValue(event.currentAvgPrice)}</td>
                        <td className="whitespace-nowrap px-4 py-3">{numberValue(event.positionBefore)} to {numberValue(event.positionAfter)}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {event.txHash ? (
                            <a className="font-mono text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline" href={`https://polygonscan.com/tx/${event.txHash}`} target="_blank" rel="noreferrer">
                              {event.txHash.slice(0, 8)}
                            </a>
                          ) : "n/a"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <h2 className="mb-3 text-base font-semibold">Polling Status</h2>
              <div className="space-y-2 text-sm">
                {data.pollingState.length === 0 ? <p className="text-zinc-600">No polling state yet.</p> : data.pollingState.map((state) => {
                  const wallet = data.wallets.find((item) => item.id === state.walletId);
                  return <div key={state.walletId} className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-2"><span>{wallet?.label ?? state.walletId}</span><span className="flex gap-2"><Badge tone={state.mode === "burst" ? "amber" : "zinc"}>{state.mode}</Badge><span className="text-zinc-500">{state.api_latency ?? 0}ms</span></span></div>;
                })}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-4">
              <h2 className="mb-3 text-base font-semibold">API Health</h2>
              <div className="space-y-2 text-sm">
                {data.apiHealth.slice(0, 8).map((sample) => <div key={sample.id} className="flex items-center justify-between gap-3 border-b border-zinc-100 pb-2"><span className="truncate">{sample.endpoint}</span><span className="flex gap-2"><Badge tone={sample.ok ? "green" : "red"}>{sample.status ?? (sample.ok ? 200 : "err")}</Badge><span className="text-zinc-500">{sample.latencyMs}ms</span></span></div>)}
                {data.apiHealth.length === 0 ? <p className="text-zinc-600">No API samples yet.</p> : null}
              </div>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
