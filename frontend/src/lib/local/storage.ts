import { Preferences } from '@capacitor/preferences';
import type { Alert, AlertEvent, Transaction } from '../../types';

export interface LocalDatabase {
  transactions: Transaction[];
  alerts: Alert[];
  alertEvents: AlertEvent[];
  sequences: { transaction: number; alert: number; event: number };
}

const STORAGE_KEY = 'eth-analyzer-db';

function empty(): LocalDatabase {
  return {
    transactions: [],
    alerts: [],
    alertEvents: [],
    sequences: { transaction: 0, alert: 0, event: 0 },
  };
}

let cache: LocalDatabase | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function normalize(raw: Partial<LocalDatabase> | null): LocalDatabase {
  if (!raw) return empty();
  return {
    transactions: raw.transactions ?? [],
    alerts: raw.alerts ?? [],
    alertEvents: raw.alertEvents ?? [],
    sequences: {
      transaction: raw.sequences?.transaction ?? 0,
      alert: raw.sequences?.alert ?? 0,
      event: raw.sequences?.event ?? 0,
    },
  };
}

export async function readDb(): Promise<LocalDatabase> {
  if (cache) return cache;
  const { value } = await Preferences.get({ key: STORAGE_KEY });
  try {
    cache = normalize(value ? (JSON.parse(value) as LocalDatabase) : null);
  } catch {
    cache = empty();
  }
  return cache;
}

/** Las escrituras se encadenan para que no se pisen entre sí. */
export async function writeDb(next: LocalDatabase): Promise<void> {
  cache = next;
  const task = writeQueue.then(() =>
    Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(next) }).then(() => undefined),
  );
  writeQueue = task.catch(() => undefined);
  return task;
}

export async function mutateDb<T>(mutator: (db: LocalDatabase) => T): Promise<T> {
  const db = await readDb();
  const draft: LocalDatabase = {
    transactions: [...db.transactions],
    alerts: [...db.alerts],
    alertEvents: [...db.alertEvents],
    sequences: { ...db.sequences },
  };
  const result = mutator(draft);
  await writeDb(draft);
  return result;
}

export async function replaceDb(next: Partial<LocalDatabase>): Promise<void> {
  await writeDb(normalize(next));
}

export function resetCache(): void {
  cache = null;
}
