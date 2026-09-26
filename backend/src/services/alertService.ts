import { getDb } from '../db/index.js';
import { logger } from '../logger.js';
import { config } from '../config.js';
import type { Alert, AlertDirection, AlertEvent } from '../types.js';
import { getCurrentPrice } from './priceService.js';

interface AlertRow {
  id: number;
  label: string;
  direction: AlertDirection;
  threshold_eur: number;
  enabled: number;
  repeatable: number;
  last_triggered_at: string | null;
  created_at: string;
}

interface AlertEventRow {
  id: number;
  alert_id: number;
  label: string;
  direction: AlertDirection;
  threshold_eur: number;
  triggered_at: string;
  price_eur: number;
  acknowledged: number;
}

export interface AlertInput {
  label: string;
  direction: AlertDirection;
  thresholdEur: number;
  enabled?: boolean;
  repeatable?: boolean;
}

/** Una alerta "armada" puede dispararse; se re-arma cuando el precio vuelve al otro lado del umbral. */
const armedState = new Map<number, boolean>();
let pollTimer: NodeJS.Timeout | null = null;

function toAlert(row: AlertRow): Alert {
  return {
    id: row.id,
    label: row.label,
    direction: row.direction,
    thresholdEur: row.threshold_eur,
    enabled: row.enabled === 1,
    repeat: row.repeatable === 1,
    lastTriggeredAt: row.last_triggered_at,
    createdAt: row.created_at,
  };
}

function toAlertEvent(row: AlertEventRow): AlertEvent {
  return {
    id: row.id,
    alertId: row.alert_id,
    label: row.label,
    direction: row.direction,
    thresholdEur: row.threshold_eur,
    triggeredAt: row.triggered_at,
    priceEur: row.price_eur,
    acknowledged: row.acknowledged === 1,
  };
}

export function listAlerts(): Alert[] {
  return getDb()
    .prepare<[], AlertRow>('SELECT * FROM alerts ORDER BY created_at DESC, id DESC')
    .all()
    .map(toAlert);
}

export function getAlert(id: number): Alert | null {
  const row = getDb().prepare<[number], AlertRow>('SELECT * FROM alerts WHERE id = ?').get(id);
  return row ? toAlert(row) : null;
}

export function createAlert(input: AlertInput): Alert {
  const result = getDb()
    .prepare(
      `INSERT INTO alerts (label, direction, threshold_eur, enabled, repeatable)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      input.label,
      input.direction,
      input.thresholdEur,
      input.enabled === false ? 0 : 1,
      input.repeatable ? 1 : 0,
    );
  const id = Number(result.lastInsertRowid);
  armedState.delete(id);
  return getAlert(id)!;
}

export function updateAlert(id: number, input: AlertInput): Alert | null {
  const result = getDb()
    .prepare(
      `UPDATE alerts
          SET label = ?, direction = ?, threshold_eur = ?, enabled = ?, repeatable = ?
        WHERE id = ?`,
    )
    .run(
      input.label,
      input.direction,
      input.thresholdEur,
      input.enabled === false ? 0 : 1,
      input.repeatable ? 1 : 0,
      id,
    );
  if (result.changes === 0) return null;
  armedState.delete(id);
  return getAlert(id);
}

export function deleteAlert(id: number): boolean {
  const result = getDb().prepare('DELETE FROM alerts WHERE id = ?').run(id);
  armedState.delete(id);
  return result.changes > 0;
}

export function listAlertEvents(limit = 50, onlyUnacknowledged = false): AlertEvent[] {
  const where = onlyUnacknowledged ? 'WHERE e.acknowledged = 0' : '';
  return getDb()
    .prepare<[number], AlertEventRow>(
      `SELECT e.id, e.alert_id, e.triggered_at, e.price_eur, e.acknowledged,
              a.label, a.direction, a.threshold_eur
         FROM alert_events e
         JOIN alerts a ON a.id = e.alert_id
         ${where}
        ORDER BY e.triggered_at DESC, e.id DESC
        LIMIT ?`,
    )
    .all(limit)
    .map(toAlertEvent);
}

export function acknowledgeEvent(id: number): boolean {
  const result = getDb().prepare('UPDATE alert_events SET acknowledged = 1 WHERE id = ?').run(id);
  return result.changes > 0;
}

export function acknowledgeAllEvents(): number {
  return getDb().prepare('UPDATE alert_events SET acknowledged = 1 WHERE acknowledged = 0').run()
    .changes;
}

function conditionMet(alert: Alert, price: number): boolean {
  return alert.direction === 'ABOVE' ? price >= alert.thresholdEur : price <= alert.thresholdEur;
}

export function evaluateAlerts(price: number, at = new Date().toISOString()): AlertEvent[] {
  const db = getDb();
  const alerts = listAlerts().filter((alert) => alert.enabled);
  const triggered: AlertEvent[] = [];

  for (const alert of alerts) {
    const met = conditionMet(alert, price);

    if (!armedState.has(alert.id)) {
      // Tras un reinicio no se vuelve a disparar una alerta que ya estaba cumplida.
      armedState.set(alert.id, alert.lastTriggeredAt ? !met : true);
    }

    if (!met) {
      armedState.set(alert.id, true);
      continue;
    }

    if (!armedState.get(alert.id)) continue;

    const result = db
      .prepare('INSERT INTO alert_events (alert_id, triggered_at, price_eur) VALUES (?, ?, ?)')
      .run(alert.id, at, price);
    db.prepare('UPDATE alerts SET last_triggered_at = ? WHERE id = ?').run(at, alert.id);
    if (!alert.repeat) {
      db.prepare('UPDATE alerts SET enabled = 0 WHERE id = ?').run(alert.id);
    }
    armedState.set(alert.id, false);

    triggered.push({
      id: Number(result.lastInsertRowid),
      alertId: alert.id,
      label: alert.label,
      direction: alert.direction,
      thresholdEur: alert.thresholdEur,
      triggeredAt: at,
      priceEur: price,
      acknowledged: false,
    });
    logger.info(`Alerta disparada: ${alert.label} (${alert.direction} ${alert.thresholdEur})`);
  }

  return triggered;
}

async function pollOnce(): Promise<void> {
  try {
    const quote = await getCurrentPrice();
    if (quote.stale) return;
    evaluateAlerts(quote.priceEur);
  } catch (error) {
    logger.warn('El poller de alertas no pudo evaluar el precio', error);
  }
}

export function startAlertPoller(): void {
  if (pollTimer) return;
  void pollOnce();
  pollTimer = setInterval(() => void pollOnce(), config.alertPollIntervalMs);
  pollTimer.unref?.();
  logger.info(`Poller de alertas cada ${config.alertPollIntervalMs} ms`);
}

export function stopAlertPoller(): void {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}
