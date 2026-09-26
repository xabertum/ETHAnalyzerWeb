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
import type { AlertEventQuery, DataSource } from './dataSource';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  });

  if (!response.ok) {
    let message = `Error ${response.status}`;
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      /* respuesta sin cuerpo JSON */
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const httpApi: DataSource = {
  listTransactions: () => request<Transaction[]>('/transactions'),
  createTransaction: (input: TransactionInput) =>
    request<Transaction>('/transactions', { method: 'POST', body: JSON.stringify(input) }),
  updateTransaction: (id: number, input: TransactionInput) =>
    request<Transaction>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteTransaction: (id: number) => request<void>(`/transactions/${id}`, { method: 'DELETE' }),

  getCurrentPrice: (refresh = false) =>
    request<PriceQuote>(`/price/current${refresh ? '?refresh=true' : ''}`),
  getPriceHistory: (days: string) => request<PriceHistory>(`/price/history?days=${days}`),

  getPortfolioSummary: () => request<PortfolioSummary>('/portfolio/summary'),

  listAlerts: () => request<Alert[]>('/alerts'),
  createAlert: (input: AlertInput) =>
    request<Alert>('/alerts', { method: 'POST', body: JSON.stringify(input) }),
  updateAlert: (id: number, input: AlertInput) =>
    request<Alert>(`/alerts/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteAlert: (id: number) => request<void>(`/alerts/${id}`, { method: 'DELETE' }),

  listAlertEvents: (options?: AlertEventQuery) => {
    const params = new URLSearchParams();
    if (options?.unread) params.set('unread', 'true');
    if (options?.limit) params.set('limit', String(options.limit));
    const query = params.toString();
    return request<AlertEvent[]>(`/alerts/events${query ? `?${query}` : ''}`);
  },
  acknowledgeEvent: (id: number) => request<void>(`/alerts/events/${id}/ack`, { method: 'POST' }),
  acknowledgeAllEvents: () =>
    request<{ acknowledged: number }>('/alerts/events/ack', { method: 'POST' }),
};

/** Descarga los datos de un backend remoto indicado por su URL (importación por wifi). */
export function createRemoteClient(baseUrl: string) {
  const root = baseUrl.replace(/\/$/, '').replace(/\/api$/, '');

  async function remoteRequest<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(`${root}/api${path}`, { signal: controller.signal });
      if (!response.ok) throw new ApiError(`El servidor respondió ${response.status}`, response.status);
      return (await response.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    listTransactions: () => remoteRequest<Transaction[]>('/transactions'),
    listAlerts: () => remoteRequest<Alert[]>('/alerts'),
    health: () => remoteRequest<{ status: string }>('/health'),
  };
}
