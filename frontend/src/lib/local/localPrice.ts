import { CapacitorHttp } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { PriceHistory, PricePoint, PriceQuote } from '../../types';

const BASE_URL = 'https://api.coingecko.com/api/v3';
const COIN_ID = 'ethereum';
const CURRENCY = 'eur';
const PRICE_TTL_MS = 30_000;
const HISTORY_TTL_MS = 300_000;
const LAST_QUOTE_KEY = 'eth-analyzer-last-quote';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

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
    throw new Error(`CoinGecko respondió ${response.status}`);
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
  const payload = await getJson<Record<string, Record<string, number>>>(
    `${BASE_URL}/simple/price`,
    {
      ids: COIN_ID,
      vs_currencies: CURRENCY,
      include_24hr_change: 'true',
      include_24hr_vol: 'true',
      include_market_cap: 'true',
      include_last_updated_at: 'true',
    },
  );

  const data = payload?.[COIN_ID];
  const price = data?.[CURRENCY];
  if (typeof price !== 'number') throw new Error('Respuesta de CoinGecko sin precio válido');

  const lastUpdated = data.last_updated_at;
  return {
    priceEur: price,
    change24h: data[`${CURRENCY}_24h_change`] ?? null,
    marketCapEur: data[`${CURRENCY}_market_cap`] ?? null,
    volume24hEur: data[`${CURRENCY}_24h_vol`] ?? null,
    updatedAt: new Date(
      typeof lastUpdated === 'number' ? lastUpdated * 1000 : Date.now(),
    ).toISOString(),
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
    const payload = await getJson<{ prices?: [number, number][] }>(
      `${BASE_URL}/coins/${COIN_ID}/market_chart`,
      { vs_currency: CURRENCY, days },
    );
    const points: PricePoint[] = (payload.prices ?? []).map(([ts, price]) => ({
      ts: new Date(ts).toISOString(),
      priceEur: price,
    }));
    historyCache.set(days, { value: points, expiresAt: Date.now() + HISTORY_TTL_MS });
    return { days, points };
  } catch (error) {
    if (cached) return { days, points: cached.value };
    throw error;
  }
}
