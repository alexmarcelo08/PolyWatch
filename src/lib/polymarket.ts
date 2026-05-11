import type { PolymarketActivity, PolymarketPosition } from "./types";

const BASE_URL = "https://data-api.polymarket.com";

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
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "polywatch-wallet-tracker/1.0" },
        cache: "no-store",
      });
      if (response.status === 429 || response.status >= 500) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      if (!response.ok) throw new Error(`Polymarket ${path} returned ${response.status}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await sleep(500 * 2 ** attempt);
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
