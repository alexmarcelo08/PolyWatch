import type { PolymarketActivity, PolymarketPosition } from "./types";
import { saveApiHealth } from "./storage";

const BASE_URL = "https://data-api.polymarket.com";
const REQUEST_TIMEOUT_MS = 8000;
const SUCCESS_HEALTH_SAMPLE_RATE = 0.03;

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(path: string, params: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, BASE_URL);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) url.searchParams.set(key, String(value));
  });

  let lastError: Error | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "polywatch-wallet-tracker/1.0" },
        cache: "no-store",
        signal: controller.signal,
      });
      const latencyMs = Date.now() - started;
      if (!response.ok || latencyMs > 1500 || Math.random() < SUCCESS_HEALTH_SAMPLE_RATE) {
        await saveApiHealth({ endpoint: path, ok: response.ok, status: response.status, latencyMs }).catch(() => undefined);
      }
      if (response.status === 429 || response.status >= 500) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new Error(`Polymarket ${path} returned ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await saveApiHealth({ endpoint: path, ok: false, latencyMs: Date.now() - started, error: lastError.message }).catch(() => undefined);
      await sleep(500 * 2 ** attempt);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError ?? new Error(`Polymarket ${path} failed`);
}

export async function fetchUserActivity(address: string) {
  return fetchJson<PolymarketActivity[]>("/activity", {
    user: address,
    limit: 100,
    sortBy: "TIMESTAMP",
    sortDirection: "DESC",
  });
}

export async function fetchCurrentPositions(address: string) {
  return fetchJson<PolymarketPosition[]>("/positions", {
    user: address,
    limit: 500,
    sizeThreshold: 0,
    sortBy: "TOKENS",
    sortDirection: "DESC",
  });
}

export async function fetchClosedPositions(address: string) {
  return fetchJson<PolymarketPosition[]>("/closed-positions", {
    user: address,
    limit: 50,
    sortBy: "TIMESTAMP",
    sortDirection: "DESC",
  });
}
