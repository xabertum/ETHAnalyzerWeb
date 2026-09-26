import type {
  Alert,
  AlertEvent,
  AlertInput,
  PortfolioSummary,
  PriceHistory,
  PriceQuote,
  Transaction,
  TransactionInput,
} from '../types';

export interface AlertEventQuery {
  unread?: boolean;
  limit?: number;
}

/**
 * Contrato común de acceso a datos. Lo implementan el backend remoto (web) y el
 * almacenamiento del dispositivo (APK de Android), de modo que la interfaz de
 * usuario es idéntica en ambas plataformas.
 */
export interface DataSource {
  listTransactions(): Promise<Transaction[]>;
  createTransaction(input: TransactionInput): Promise<Transaction>;
  updateTransaction(id: number, input: TransactionInput): Promise<Transaction>;
  deleteTransaction(id: number): Promise<void>;

  getCurrentPrice(refresh?: boolean): Promise<PriceQuote>;
  getPriceHistory(days: string): Promise<PriceHistory>;

  getPortfolioSummary(): Promise<PortfolioSummary>;

  listAlerts(): Promise<Alert[]>;
  createAlert(input: AlertInput): Promise<Alert>;
  updateAlert(id: number, input: AlertInput): Promise<Alert>;
  deleteAlert(id: number): Promise<void>;

  listAlertEvents(options?: AlertEventQuery): Promise<AlertEvent[]>;
  acknowledgeEvent(id: number): Promise<void>;
  acknowledgeAllEvents(): Promise<{ acknowledged: number }>;
}

/** Capacitor inyecta este objeto solo dentro de la app nativa. */
interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
}

export function isNativePlatform(): boolean {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return Boolean(capacitor?.isNativePlatform?.());
}
