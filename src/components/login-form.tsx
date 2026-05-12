"use client";

import { FormEvent, useState } from "react";
import { LogIn } from "lucide-react";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Request failed");
  return data as T;
}

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="grid gap-1 text-sm font-medium text-zinc-700">
        Email
        <input className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-500" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" required />
      </label>
      <label className="grid gap-1 text-sm font-medium text-zinc-700">
        Password
        <input className="h-11 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-emerald-500" value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required />
      </label>
      {error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
      <button disabled={busy} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white disabled:opacity-50">
        <LogIn size={16} /> Sign In
      </button>
    </form>
  );
}
