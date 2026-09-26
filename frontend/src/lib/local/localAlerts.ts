import type { Alert, AlertEvent, AlertInput } from '../../types';
import { mutateDb, readDb } from './storage';
import { ValidationError } from './localTransactions';

export function validateAlert(input: AlertInput): Required<Omit<AlertInput, 'enabled' | 'repeatable'>> & {
  enabled: boolean;
  repeatable: boolean;
} {
  const label = input.label?.trim();
  if (!label) throw new ValidationError('El nombre es obligatorio');
  if (input.direction !== 'ABOVE' && input.direction !== 'BELOW') {
    throw new ValidationError('Condición no válida');
  }
  if (!(input.thresholdEur > 0)) throw new ValidationError('El umbral debe ser mayor que 0');

  return {
    label: label.slice(0, 80),
    direction: input.direction,
    thresholdEur: input.thresholdEur,
    enabled: input.enabled !== false,
    repeatable: Boolean(input.repeatable),
  };
}

export async function listAlerts(): Promise<Alert[]> {
  const db = await readDb();
  return [...db.alerts].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
}

export async function createAlert(input: AlertInput): Promise<Alert> {
  const data = validateAlert(input);
  return mutateDb((db) => {
    const alert: Alert = {
      id: ++db.sequences.alert,
      label: data.label,
      direction: data.direction,
      thresholdEur: data.thresholdEur,
      enabled: data.enabled,
      repeat: data.repeatable,
      lastTriggeredAt: null,
      createdAt: new Date().toISOString(),
    };
    db.alerts = [...db.alerts, alert];
    return alert;
  });
}

export async function updateAlert(id: number, input: AlertInput): Promise<Alert> {
  const data = validateAlert(input);
  return mutateDb((db) => {
    const index = db.alerts.findIndex((item) => item.id === id);
    if (index === -1) throw new ValidationError('Alerta no encontrada');
    const updated: Alert = {
      ...db.alerts[index],
      label: data.label,
      direction: data.direction,
      thresholdEur: data.thresholdEur,
      enabled: data.enabled,
      repeat: data.repeatable,
    };
    db.alerts = db.alerts.map((item, i) => (i === index ? updated : item));
    return updated;
  });
}

export async function deleteAlert(id: number): Promise<void> {
  await mutateDb((db) => {
    db.alerts = db.alerts.filter((item) => item.id !== id);
    db.alertEvents = db.alertEvents.filter((event) => event.alertId !== id);
  });
}

export async function listAlertEvents(options?: {
  unread?: boolean;
  limit?: number;
}): Promise<AlertEvent[]> {
  const db = await readDb();
  const limit = options?.limit ?? 50;
  return db.alertEvents
    .filter((event) => (options?.unread ? !event.acknowledged : true))
    .sort((a, b) => b.triggeredAt.localeCompare(a.triggeredAt) || b.id - a.id)
    .slice(0, limit);
}

export async function acknowledgeEvent(id: number): Promise<void> {
  await mutateDb((db) => {
    db.alertEvents = db.alertEvents.map((event) =>
      event.id === id ? { ...event, acknowledged: true } : event,
    );
  });
}

export async function acknowledgeAllEvents(): Promise<{ acknowledged: number }> {
  return mutateDb((db) => {
    let acknowledged = 0;
    db.alertEvents = db.alertEvents.map((event) => {
      if (event.acknowledged) return event;
      acknowledged += 1;
      return { ...event, acknowledged: true };
    });
    return { acknowledged };
  });
}

function conditionMet(alert: Alert, price: number): boolean {
  return alert.direction === 'ABOVE' ? price >= alert.thresholdEur : price <= alert.thresholdEur;
}

/**
 * Una alerta solo vuelve a dispararse cuando el precio ha salido antes del lado del umbral,
 * igual que el poller del backend. El estado de armado se deriva de `lastTriggeredAt`.
 */
export async function evaluateAlerts(price: number): Promise<AlertEvent[]> {
  return mutateDb((db) => {
    const triggered: AlertEvent[] = [];
    const at = new Date().toISOString();

    db.alerts = db.alerts.map((alert) => {
      if (!alert.enabled) return alert;

      const met = conditionMet(alert, price);
      if (!met) return alert.lastTriggeredAt ? { ...alert, lastTriggeredAt: null } : alert;

      // Ya estaba cumplida en la comprobación anterior: no se repite hasta que se rearme.
      if (alert.lastTriggeredAt) return alert;

      const event: AlertEvent = {
        id: ++db.sequences.event,
        alertId: alert.id,
        label: alert.label,
        direction: alert.direction,
        thresholdEur: alert.thresholdEur,
        triggeredAt: at,
        priceEur: price,
        acknowledged: false,
      };
      triggered.push(event);
      db.alertEvents = [...db.alertEvents, event];

      return { ...alert, lastTriggeredAt: at, enabled: alert.repeat ? true : false };
    });

    return triggered;
  });
}
