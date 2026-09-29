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
  kraken: {
    baseUrl: process.env.KRAKEN_BASE_URL ?? 'https://api.kraken.com',
    pair: process.env.KRAKEN_PAIR ?? 'ETHEUR',
  },
  baseCurrency: (process.env.BASE_CURRENCY ?? 'eur').toLowerCase(),
  priceCacheTtlMs: num(process.env.PRICE_CACHE_TTL_MS, 30_000),
  historyCacheTtlMs: num(process.env.HISTORY_CACHE_TTL_MS, 300_000),
  alertPollIntervalMs: num(process.env.ALERT_POLL_INTERVAL_MS, 60_000),
} as const;

export type AppConfig = typeof config;
