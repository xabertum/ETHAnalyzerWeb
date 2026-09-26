import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(here, '..');
const repoRoot = path.resolve(backendRoot, '..');

function num(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  port: num(process.env.PORT, 4000),
  dbPath: process.env.DB_PATH ?? path.join(repoRoot, 'data', 'eth.db'),
  excelPath:
    process.env.EXCEL_PATH ?? path.join(repoRoot, 'data', 'Gastos Aplazados (2019_29).xlsx'),
  excelSheet: process.env.EXCEL_SHEET ?? 'Inversión Crypto',
  coingecko: {
    baseUrl: process.env.COINGECKO_BASE_URL ?? 'https://api.coingecko.com/api/v3',
    coinId: process.env.COINGECKO_COIN_ID ?? 'ethereum',
    apiKey: process.env.COINGECKO_API_KEY ?? '',
  },
  baseCurrency: (process.env.BASE_CURRENCY ?? 'eur').toLowerCase(),
  priceCacheTtlMs: num(process.env.PRICE_CACHE_TTL_MS, 30_000),
  historyCacheTtlMs: num(process.env.HISTORY_CACHE_TTL_MS, 300_000),
  alertPollIntervalMs: num(process.env.ALERT_POLL_INTERVAL_MS, 60_000),
} as const;

export type AppConfig = typeof config;
