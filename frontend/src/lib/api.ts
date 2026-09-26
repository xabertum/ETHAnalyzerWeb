import type { AlertEventQuery, DataSource } from './dataSource';
import { isNativePlatform } from './dataSource';
import { httpApi } from './httpApi';

export { ApiError } from './httpApi';

let resolved: DataSource | null = null;
let pending: Promise<DataSource> | null = null;

/**
 * En la app nativa la implementación local se carga de forma diferida, de modo que
 * su código (y los plugins de Capacitor) no entran en el bundle de la web.
 */
async function impl(): Promise<DataSource> {
  if (resolved) return resolved;
  if (!pending) {
    pending = (async () => {
      if (isNativePlatform()) {
        const { createLocalApi } = await import('./local/localApi');
        resolved = createLocalApi();
      } else {
        resolved = httpApi;
      }
      return resolved;
    })();
  }
  return pending;
}

export const api: DataSource = {
  listTransactions: async () => (await impl()).listTransactions(),
  createTransaction: async (input) => (await impl()).createTransaction(input),
  updateTransaction: async (id, input) => (await impl()).updateTransaction(id, input),
  deleteTransaction: async (id) => (await impl()).deleteTransaction(id),

  getCurrentPrice: async (refresh = false) => (await impl()).getCurrentPrice(refresh),
  getPriceHistory: async (days) => (await impl()).getPriceHistory(days),

  getPortfolioSummary: async () => (await impl()).getPortfolioSummary(),

  listAlerts: async () => (await impl()).listAlerts(),
  createAlert: async (input) => (await impl()).createAlert(input),
  updateAlert: async (id, input) => (await impl()).updateAlert(id, input),
  deleteAlert: async (id) => (await impl()).deleteAlert(id),

  listAlertEvents: async (options?: AlertEventQuery) => (await impl()).listAlertEvents(options),
  acknowledgeEvent: async (id) => (await impl()).acknowledgeEvent(id),
  acknowledgeAllEvents: async () => (await impl()).acknowledgeAllEvents(),
};
