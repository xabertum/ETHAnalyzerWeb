import { config } from '../config.js';
import { logger } from '../logger.js';
import { getDb } from '../db/index.js';
import type { PricePoint, PriceQuote } from '../types.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

let quoteCache: CacheEntry<PriceQuote> | null = null;
const historyCache = new Map<string, CacheEntry<PricePoint[]>>();
let inFlightQuote: Promise<PriceQuote> | null = null;

function buildUrl(pathname: string, params: Record<string, string>): string {
  const url = new URL(`${config.coingecko.baseUrl}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

async function coingeckoFetch(url: string): Promise<unknown> {
  const headers: Record<string, string> = { accept: 'application/json' };
  if (config.coingecko.apiKey) {
    headers['x-cg-demo-api-key'] = config.coingecko.apiKey;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { headers, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`CoinGecko respondió ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function lastSnapshot(): PriceQuote | null {
  const row = getDb()
    .prepare<[], { ts: string; price_eur: number; change_24h: number | null }>(
      'SELECT ts, price_eur, change_24h FROM price_snapshots ORDER BY ts DESC LIMIT 1',
    )
    .get();
  if (!row) return null;
  return {
    priceEur: row.price_eur,
    change24h: row.change_24h,
    marketCapEur: null,
    volume24hEur: null,
    updatedAt: row.ts,
    stale: true,
  };
}

function saveSnapshot(quote: PriceQuote): void {
  getDb()
    .prepare('INSERT INTO price_snapshots (ts, price_eur, change_24h) VALUES (?, ?, ?)')
    .run(quote.updatedAt, quote.priceEur, quote.change24h);
}

async function fetchQuote(): Promise<PriceQuote> {
  const currency = config.baseCurrency;
  const url = buildUrl('/simple/price', {
    ids: config.coingecko.coinId,
    vs_currencies: currency,
    include_24hr_change: 'true',
    include_24hr_vol: 'true',
    include_market_cap: 'true',
    include_last_updated_at: 'true',
  });

  const payload = (await coingeckoFetch(url)) as Record<string, Record<string, number>>;
  const data = payload?.[config.coingecko.coinId];
  const price = data?.[currency];
  if (typeof price !== 'number') {
    throw new Error('Respuesta de CoinGecko sin precio válido');
  }

  const lastUpdated = data[`last_updated_at`];
  return {
    priceEur: price,
    change24h: data[`${currency}_24h_change`] ?? null,
    marketCapEur: data[`${currency}_market_cap`] ?? null,
    volume24hEur: data[`${currency}_24h_vol`] ?? null,
    updatedAt: new Date(
      typeof lastUpdated === 'number' ? lastUpdated * 1000 : Date.now(),
    ).toISOString(),
    stale: false,
  };
}

export async function getCurrentPrice(forceRefresh = false): Promise<PriceQuote> {
  const now = Date.now();
  if (!forceRefresh && quoteCache && quoteCache.expiresAt > now) {
    return quoteCache.value;
  }
  if (inFlightQuote) return inFlightQuote;

  inFlightQuote = (async () => {
    try {
      const quote = await fetchQuote();
      quoteCache = { value: quote, expiresAt: Date.now() + config.priceCacheTtlMs };
      saveSnapshot(quote);
      return quote;
    } catch (error) {
      logger.warn('No se pudo obtener el precio de CoinGecko', error);
      const fallback = quoteCache?.value ?? lastSnapshot();
      if (fallback) return { ...fallback, stale: true };
      throw error;
    } finally {
      inFlightQuote = null;
    }
  })();

  return inFlightQuote;
}

export async function getPriceHistory(days: string): Promise<PricePoint[]> {
  const key = `${days}-${config.baseCurrency}`;
  const cached = historyCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const url = buildUrl(`/coins/${config.coingecko.coinId}/market_chart`, {
    vs_currency: config.baseCurrency,
    days,
  });

  try {
    const payload = (await coingeckoFetch(url)) as { prices?: [number, number][] };
    const points: PricePoint[] = (payload.prices ?? []).map(([ts, price]) => ({
      ts: new Date(ts).toISOString(),
      priceEur: price,
    }));
    historyCache.set(key, { value: points, expiresAt: Date.now() + config.historyCacheTtlMs });
    return points;
  } catch (error) {
    logger.warn(`No se pudo obtener el histórico (${days}d) de CoinGecko`, error);
    if (cached) return cached.value;
    throw error;
  }
}
