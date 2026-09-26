import type { Alert, AlertEvent, Transaction } from '../../types';
import { createRemoteClient } from '../httpApi';
import { readDb, replaceDb, resetCache } from './storage';

export interface BackupPayload {
  version: 1;
  exportedAt: string;
  transactions: Transaction[];
  alerts: Alert[];
  alertEvents: AlertEvent[];
}

export interface ImportResult {
  transactions: number;
  alerts: number;
}

function maxId<T extends { id: number }>(items: T[]): number {
  return items.reduce((max, item) => Math.max(max, item.id), 0);
}

/** Descarga operaciones y alertas del backend del PC y reemplaza los datos locales. */
export async function importFromBackend(baseUrl: string): Promise<ImportResult> {
  const client = createRemoteClient(baseUrl);
  const [transactions, alerts] = await Promise.all([
    client.listTransactions(),
    client.listAlerts().catch(() => [] as Alert[]),
  ]);

  await replaceDb({
    transactions,
    alerts,
    alertEvents: [],
    sequences: {
      transaction: maxId(transactions),
      alert: maxId(alerts),
      event: 0,
    },
  });

  return { transactions: transactions.length, alerts: alerts.length };
}

export async function exportBackup(): Promise<BackupPayload> {
  const db = await readDb();
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions: db.transactions,
    alerts: db.alerts,
    alertEvents: db.alertEvents,
  };
}

export async function importBackup(raw: string): Promise<ImportResult> {
  let parsed: BackupPayload;
  try {
    parsed = JSON.parse(raw) as BackupPayload;
  } catch {
    throw new Error('El fichero no contiene un JSON válido');
  }

  if (!Array.isArray(parsed.transactions)) {
    throw new Error('El fichero no tiene el formato esperado');
  }

  const alerts = Array.isArray(parsed.alerts) ? parsed.alerts : [];
  const alertEvents = Array.isArray(parsed.alertEvents) ? parsed.alertEvents : [];

  await replaceDb({
    transactions: parsed.transactions,
    alerts,
    alertEvents,
    sequences: {
      transaction: maxId(parsed.transactions),
      alert: maxId(alerts),
      event: maxId(alertEvents),
    },
  });

  return { transactions: parsed.transactions.length, alerts: alerts.length };
}

export async function clearAllData(): Promise<void> {
  await replaceDb({});
  resetCache();
}
