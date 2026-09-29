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

interface KrakenTicker {
  c?: [string, ...string[]];
  p?: [string, ...string[]];
  v?: [string, ...string[]];
}

type KrakenOhlcRow = [number, string, string, string, string, ...unknown[]];

interface KrakenOhlc {
  result?: Record<string, KrakenOhlcRow[] | number>;
}

const historyIntervals: Record<string, number> = {
  '1': 5,
  '7': 15,
  '30': 60,
  '90': 240,
  '180': 720,
  '365': 1440,
  max: 1440,
};

function buildUrl(pathname: string, params: Record<string, string>): string {
  const url = new URL(`${config.kraken.baseUrl}${pathname}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function getOhlcRows(payload: KrakenOhlc): KrakenOhlcRow[] | null {
  const rows = payload.result
    ? Object.entries(payload.result).find(([key, value]) => key !== 'last' && Array.isArray(value))?.[1]
    : undefined;
  return Array.isArray(rows) ? rows : null;
}

async function krakenFetch(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Kraken respondió ${response.status} ${response.statusText}`);
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
  const url = buildUrl('/0/public/Ticker', {
    pair: config.kraken.pair,
  });
  const payload = (await krakenFetch(url)) as { result?: Record<string, KrakenTicker> };
  const ticker = payload.result && Object.values(payload.result)[0];
  const price = Number(ticker?.c?.[0]);
  if (!Number.isFinite(price)) {
    throw new Error('Respuesta de Kraken sin precio válido');
  }

  const average24h = Number(ticker?.p?.[1]);
  const volume24h = Number(ticker?.v?.[1]);
  return {
    priceEur: price,
    change24h:
      Number.isFinite(average24h) && average24h > 0 ? ((price - average24h) / average24h) * 100 : null,
    marketCapEur: null,
    volume24hEur:
      Number.isFinite(volume24h) && Number.isFinite(average24h) ? volume24h * average24h : null,
    updatedAt: new Date().toISOString(),
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
      logger.warn('No se pudo obtener el precio de Kraken', error);
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

  const interval = historyIntervals[days];
  const params: Record<string, string> = {
    pair: config.kraken.pair,
    interval: String(interval),
  };
  if (days !== 'max') {
    params.since = String(Math.floor(Date.now() / 1000) - Number(days) * 86_400);
  }
  const url = buildUrl('/0/public/OHLC', params);

  try {
    const payload = (await krakenFetch(url)) as KrakenOhlc;
    const rows = getOhlcRows(payload);
    if (!rows) {
      throw new Error('Respuesta de Kraken sin histórico válido');
    }
    const points: PricePoint[] = rows.map(([ts, , , , close]) => ({
      ts: new Date(ts * 1000).toISOString(),
      priceEur: Number(close),
    }));
    if (points.some((point) => !Number.isFinite(point.priceEur))) {
      throw new Error('Respuesta de Kraken con precios no válidos');
    }
    historyCache.set(key, { value: points, expiresAt: Date.now() + config.historyCacheTtlMs });
    return points;
  } catch (error) {
    logger.warn(`No se pudo obtener el histórico (${days}d) de Kraken`, error);
    if (cached) return cached.value;
    throw error;
  }
}
