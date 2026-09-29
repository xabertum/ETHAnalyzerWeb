import { CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { PriceHistory, PricePoint, PriceQuote } from '../../types';

const KRAKEN_BASE_URL = 'https://api.kraken.com';
const KRAKEN_PAIR = 'ETHEUR';
const PRICE_TTL_MS = 30_000;
const HISTORY_TTL_MS = 300_000;
const LAST_QUOTE_KEY = 'eth-analyzer-last-quote';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

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

let quoteCache: CacheEntry<PriceQuote> | null = null;
const historyCache = new Map<string, CacheEntry<PricePoint[]>>();
let inFlight: Promise<PriceQuote> | null = null;

/** CapacitorHttp hace la petición de forma nativa, evitando restricciones de CORS. */
async function getJson<T>(url: string, params: Record<string, string>): Promise<T> {
  const response = await CapacitorHttp.get({
    url,
    params,
    headers: { accept: 'application/json' },
    connectTimeout: 15_000,
    readTimeout: 15_000,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Kraken respondió ${response.status}`);
  }

  function getOhlcRows(payload: KrakenOhlc): KrakenOhlcRow[] | null {
    const rows = payload.result
      ? Object.entries(payload.result).find(([key, value]) => key !== 'last' && Array.isArray(value))?.[1]
      : undefined;
    return Array.isArray(rows) ? rows : null;
  }

  return (
    typeof response.data === 'string' ? JSON.parse(response.data) : response.data
  ) as T;
}

async function rememberQuote(quote: PriceQuote): Promise<void> {
  try {
    await Preferences.set({ key: LAST_QUOTE_KEY, value: JSON.stringify(quote) });
  } catch {
    /* el respaldo es best-effort */
  }
}

async function lastKnownQuote(): Promise<PriceQuote | null> {
  try {
    const { value } = await Preferences.get({ key: LAST_QUOTE_KEY });
    return value ? ({ ...(JSON.parse(value) as PriceQuote), stale: true }) : null;
  } catch {
    return null;
  }
}

async function fetchQuote(): Promise<PriceQuote> {
  const payload = await getJson<{ result?: Record<string, KrakenTicker> }>(
    `${KRAKEN_BASE_URL}/0/public/Ticker`,
    { pair: KRAKEN_PAIR },
  );
  const ticker = payload.result && Object.values(payload.result)[0];
  const price = Number(ticker?.c?.[0]);
  if (!Number.isFinite(price)) throw new Error('Respuesta de Kraken sin precio válido');

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
  if (!forceRefresh && quoteCache && quoteCache.expiresAt > now) return quoteCache.value;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const quote = await fetchQuote();
      quoteCache = { value: quote, expiresAt: Date.now() + PRICE_TTL_MS };
      void rememberQuote(quote);
      return quote;
    } catch (error) {
      const fallback = quoteCache?.value ?? (await lastKnownQuote());
      if (fallback) return { ...fallback, stale: true };
      throw error;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export async function getPriceHistory(days: string): Promise<PriceHistory> {
  const cached = historyCache.get(days);
  if (cached && cached.expiresAt > Date.now()) return { days, points: cached.value };

  try {
    const interval = historyIntervals[days];
    const params: Record<string, string> = { pair: KRAKEN_PAIR, interval: String(interval) };
    if (days !== 'max') {
      params.since = String(Math.floor(Date.now() / 1000) - Number(days) * 86_400);
    }
    const payload = await getJson<KrakenOhlc>(`${KRAKEN_BASE_URL}/0/public/OHLC`, params);
    const rows = getOhlcRows(payload);
    if (!rows) throw new Error('Respuesta de Kraken sin histórico válido');
    const points: PricePoint[] = rows.map(([ts, , , , close]) => ({
      ts: new Date(ts * 1000).toISOString(),
      priceEur: Number(close),
    }));
    if (points.some((point) => !Number.isFinite(point.priceEur))) {
      throw new Error('Respuesta de Kraken con precios no válidos');
    }
    historyCache.set(days, { value: points, expiresAt: Date.now() + HISTORY_TTL_MS });
    return { days, points };
  } catch (error) {
    if (cached) return { days, points: cached.value };
    throw error;
  }
}
