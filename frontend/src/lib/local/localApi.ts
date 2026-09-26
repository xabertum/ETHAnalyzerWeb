import type { DataSource } from '../dataSource';
import {
  acknowledgeAllEvents,
  acknowledgeEvent,
  createAlert,
  deleteAlert,
  evaluateAlerts,
  listAlertEvents,
  listAlerts,
  updateAlert,
} from './localAlerts';
import { syncAlertsToRunner } from './backgroundRunner';
import { notifyAlertEvents } from './notifications';
import { getCurrentPrice, getPriceHistory } from './localPrice';
import { buildSummary } from './localPortfolio';
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  updateTransaction,
} from './localTransactions';

/**
 * Cada lectura de precio en primer plano evalúa también las alertas, ocupando el lugar
 * del poller que en la web vive en el backend. No bloquea la respuesta al llamante.
 */
async function withAlertEvaluation(refresh: boolean) {
  const quote = await getCurrentPrice(refresh);
  if (!quote.stale) {
    void evaluateAlerts(quote.priceEur)
      .then(async (events) => {
        await notifyAlertEvents(events);
        if (events.length > 0) await syncAlertsToRunner(await listAlerts());
      })
      .catch(() => undefined);
  }
  return quote;
}

/** Tras cualquier cambio, el runner de segundo plano recibe la lista actualizada. */
async function pushAlertsToRunner(): Promise<void> {
  void syncAlertsToRunner(await listAlerts()).catch(() => undefined);
}

export function createLocalApi(): DataSource {
  return {
    listTransactions,
    createTransaction,
    updateTransaction,
    deleteTransaction,

    getCurrentPrice: (refresh = false) => withAlertEvaluation(refresh),
    getPriceHistory,

    getPortfolioSummary: async () => {
      const [transactions, quote] = await Promise.all([
        listTransactions(),
        getCurrentPrice().catch(() => null),
      ]);
      return buildSummary(transactions, quote);
    },

    listAlerts,
    createAlert: async (input) => {
      const alert = await createAlert(input);
      await pushAlertsToRunner();
      return alert;
    },
    updateAlert: async (id, input) => {
      const alert = await updateAlert(id, input);
      await pushAlertsToRunner();
      return alert;
    },
    deleteAlert: async (id) => {
      await deleteAlert(id);
      await pushAlertsToRunner();
    },

    listAlertEvents,
    acknowledgeEvent,
    acknowledgeAllEvents,
  };
}
