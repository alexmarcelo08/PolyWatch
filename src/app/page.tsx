import Link from "next/link";
import { Activity, Bell, ShieldCheck, WalletCards } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <main className="min-h-screen bg-white text-zinc-950">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <nav className="flex items-center justify-between border-b border-zinc-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-emerald-600 text-white">
              <Activity size={22} />
            </div>
            <span className="text-xl font-semibold">PolyWatch</span>
          </div>
          <Link className="inline-flex h-10 items-center rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white" href={user ? "/dashboard" : "/login"}>
            {user ? "Open Dashboard" : "Login"}
          </Link>
        </nav>

        <div className="grid flex-1 content-center gap-10 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-normal text-zinc-950 sm:text-5xl">
              Polymarket wallet tracking and dry-run copy trading.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600">
              Track wallet activity, receive Telegram alerts, review average entry prices, and create manual or dry-run copy trade intents before any real execution is allowed.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="inline-flex h-11 items-center rounded-md bg-emerald-600 px-5 text-sm font-semibold text-white" href={user ? "/dashboard" : "/login"}>
                {user ? "Go to Dashboard" : "Sign In"}
              </Link>
              <a className="inline-flex h-11 items-center rounded-md border border-zinc-300 px-5 text-sm font-semibold text-zinc-800" href="https://polywatch.zeabur.app" rel="noreferrer">
                Deployed App
              </a>
            </div>
          </div>

          <div className="grid gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
            {[
              { icon: WalletCards, title: "User-isolated wallets", body: "Each user gets separate wallets, Telegram chat ID, copy settings, positions, and intents." },
              { icon: Bell, title: "Telegram alerts", body: "Detected trades include market, side, size, price, position changes, and average price updates." },
              { icon: ShieldCheck, title: "Safe defaults", body: "Auto trading is off by default. Dry-run and manual-confirm modes work first." },
            ].map((item) => (
              <div key={item.title} className="rounded-md border border-zinc-200 bg-white p-4">
                <div className="flex items-center gap-2">
                  <item.icon size={18} />
                  <h2 className="text-sm font-semibold">{item.title}</h2>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
