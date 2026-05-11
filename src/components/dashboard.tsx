"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  CheckCircle2,
  CirclePause,
  Clock3,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  WalletCards,
  X,
} from "lucide-react";
import type { ActivityEvent, SystemState, Wallet } from "@/lib/types";

type DashboardPayload = {
  wallets: Wallet[];
  activity: ActivityEvent[];
  system: SystemState;
  config: {
    pollIntervalSeconds: number;
    telegramConfigured: boolean;
    storagePath: string;
  };
};

const emptyPayload: DashboardPayload = {
  wallets: [],
  activity: [],
  system: { pollCount: 0, running: false },
  config: { pollIntervalSeconds: 45, telegramConfigured: false, storagePath: ".data/polywatch.json" },
};

function formatDate(value?: string) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

function StatusDot({ status }: { status: Wallet["status"] }) {
  const className =
    status === "active"
      ? "bg-emerald-500"
      : status === "paused"
        ? "bg-amber-500"
        : "bg-red-500";
  return <span className={`h-2.5 w-2.5 rounded-full ${className}`} aria-hidden="true" />;
}

function ActionBadge({ action }: { action: ActivityEvent["action"] }) {
  const tone = action === "SELL_FILLED" || action === "POSITION_CLOSED" ? "border-amber-200 bg-amber-50 text-amber-800" : action === "PNL_REALIZED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-zinc-200 bg-zinc-50 text-zinc-800";
  return (
    <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-semibold ${tone}`}>
      {action.replaceAll("_", " ")}
    </span>
  );
}

function WalletEditor({
  wallet,
  onDone,
  onCancel,
}: {
  wallet: Wallet;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(wallet.label);
  const [address, setAddress] = useState(wallet.address);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await requestJson(`/api/wallets/${wallet.id}`, {
        method: "PATCH",
        body: JSON.stringify({ label, address }),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-2 border-t border-zinc-200 pt-3 md:grid-cols-[140px_1fr_auto]">
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

export function Dashboard() {
  const [data, setData] = useState<DashboardPayload>(emptyPayload);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  const activeWallets = useMemo(() => data.wallets.filter((wallet) => wallet.status === "active").length, [data.wallets]);

  async function load(silent = false) {
    if (!silent) setLoading(true);
    setError("");
    try {
      setData(await requestJson<DashboardPayload>("/api/dashboard"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const initialLoad = setTimeout(() => void load(true), 0);
    const id = setInterval(() => void load(true), 10000);
    return () => {
      clearTimeout(initialLoad);
      clearInterval(id);
    };
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
              <p className="text-sm text-zinc-600">{activeWallets} active wallet{activeWallets === 1 ? "" : "s"} · interval {data.config.pollIntervalSeconds}s</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={checkNow} disabled={busy === "check"} className="inline-flex h-10 items-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-50">
              <RefreshCw size={16} className={busy === "check" ? "animate-spin" : ""} /> Check Now
            </button>
            <button onClick={testTelegram} disabled={busy === "telegram"} className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 px-4 text-sm font-semibold text-zinc-800 disabled:opacity-50">
              <Send size={16} /> Telegram Test
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
              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-600">Status</dt>
                <dd className="font-medium">{data.system.running ? "Polling" : "Idle"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-600">Last poll</dt>
                <dd className="font-medium">{formatDate(data.system.lastPollCompletedAt)}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-600">Telegram</dt>
                <dd className={data.config.telegramConfigured ? "font-medium text-emerald-700" : "font-medium text-amber-700"}>{data.config.telegramConfigured ? "Configured" : "Missing env"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-zinc-600">Poll count</dt>
                <dd className="font-medium">{data.system.pollCount}</dd>
              </div>
            </dl>
            {data.system.lastError ? <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{data.system.lastError}</p> : null}
          </section>
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
                data.wallets.map((wallet) => (
                  <div key={wallet.id} className="p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <StatusDot status={wallet.status} />
                          <h3 className="truncate text-sm font-semibold">{wallet.label}</h3>
                        </div>
                        <p className="mt-1 font-mono text-xs text-zinc-600">{compactAddress(wallet.address)}</p>
                        <p className="mt-1 text-xs text-zinc-500">Last checked {formatDate(wallet.lastCheckedAt)}</p>
                        {wallet.lastError ? <p className="mt-1 text-xs text-red-700">{wallet.lastError}</p> : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
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
                    </div>
                    {editingId === wallet.id ? <WalletEditor wallet={wallet} onDone={() => { setEditingId(null); void load(true); }} onCancel={() => setEditingId(null)} /> : null}
                  </div>
                ))
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
                <table className="w-full min-w-[780px] border-collapse text-left text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Time</th>
                      <th className="px-4 py-3 font-semibold">Wallet</th>
                      <th className="px-4 py-3 font-semibold">Action</th>
                      <th className="px-4 py-3 font-semibold">Market</th>
                      <th className="px-4 py-3 font-semibold">Side</th>
                      <th className="px-4 py-3 font-semibold">Size</th>
                      <th className="px-4 py-3 font-semibold">Price</th>
                      <th className="px-4 py-3 font-semibold">PnL</th>
                      <th className="px-4 py-3 font-semibold">Tx</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {data.activity.map((event) => (
                      <tr key={event.id} className="align-top">
                        <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{formatDate(event.timestamp)}</td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium">{event.walletLabel}</td>
                        <td className="px-4 py-3"><ActionBadge action={event.action} /></td>
                        <td className="max-w-sm px-4 py-3">{event.marketTitle}</td>
                        <td className="whitespace-nowrap px-4 py-3">{event.outcome ?? event.side ?? "n/a"}</td>
                        <td className="whitespace-nowrap px-4 py-3">{numberValue(event.size)}</td>
                        <td className="whitespace-nowrap px-4 py-3">{numberValue(event.price)}</td>
                        <td className={event.pnl !== undefined && event.pnl >= 0 ? "whitespace-nowrap px-4 py-3 text-emerald-700" : "whitespace-nowrap px-4 py-3 text-zinc-700"}>{event.pnl === undefined ? "n/a" : money(event.pnl)}</td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {event.txHash ? (
                            <a className="font-mono text-xs font-semibold text-emerald-700 underline-offset-2 hover:underline" href={`https://polygonscan.com/tx/${event.txHash}`} target="_blank" rel="noreferrer">
                              {event.txHash.slice(0, 8)}
                            </a>
                          ) : (
                            "n/a"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
