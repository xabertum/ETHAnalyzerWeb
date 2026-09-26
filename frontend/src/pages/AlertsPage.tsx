import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useAlertWatcher } from '../components/AlertWatcher';
import { useToast } from '../components/ToastProvider';
import { api } from '../lib/api';
import { formatDateTime, formatEur } from '../lib/format';
import type { Alert, AlertDirection } from '../types';

export function AlertsPage() {
  const { push } = useToast();
  const {
    events,
    refresh,
    acknowledgeAll,
    unreadCount,
    notificationsEnabled,
    requestNotifications,
  } = useAlertWatcher();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [label, setLabel] = useState('');
  const [direction, setDirection] = useState<AlertDirection>('ABOVE');
  const [threshold, setThreshold] = useState('');
  const [repeatable, setRepeatable] = useState(true);

  const load = useCallback(async () => {
    try {
      setAlerts(await api.listAlerts());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las alertas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault();
    const thresholdEur = Number(threshold.replace(',', '.'));
    if (!label.trim()) {
      setError('Pon un nombre a la alerta');
      return;
    }
    if (!(thresholdEur > 0)) {
      setError('El umbral debe ser mayor que 0');
      return;
    }

    setSaving(true);
    try {
      await api.createAlert({ label: label.trim(), direction, thresholdEur, repeatable });
      setLabel('');
      setThreshold('');
      setError(null);
      push({ kind: 'success', title: 'Alerta creada' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la alerta');
    } finally {
      setSaving(false);
    }
  }

  async function toggleAlert(alert: Alert): Promise<void> {
    try {
      await api.updateAlert(alert.id, {
        label: alert.label,
        direction: alert.direction,
        thresholdEur: alert.thresholdEur,
        enabled: !alert.enabled,
        repeatable: alert.repeat,
      });
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'No se pudo actualizar la alerta',
        body: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function removeAlert(alert: Alert): Promise<void> {
    if (!window.confirm(`¿Eliminar la alerta "${alert.label}"?`)) return;
    try {
      await api.deleteAlert(alert.id);
      push({ kind: 'success', title: 'Alerta eliminada' });
      await Promise.all([load(), refresh()]);
    } catch (err) {
      push({
        kind: 'error',
        title: 'No se pudo eliminar la alerta',
        body: err instanceof Error ? err.message : undefined,
      });
    }
  }

  return (
    <div className="stack">
      {error ? <div className="error-banner">{error}</div> : null}

      {!notificationsEnabled ? (
        <div className="warn-banner">
          Las notificaciones del navegador están desactivadas.{' '}
          <button type="button" className="btn small" onClick={() => void requestNotifications()}>
            Activarlas
          </button>
        </div>
      ) : null}

      <section className="card">
        <div className="section-header">
          <h2>Nueva alerta de precio</h2>
        </div>
        <form onSubmit={(event) => void handleCreate(event)}>
          <div className="form-grid">
            <label className="field">
              Nombre
              <input
                type="text"
                value={label}
                maxLength={80}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Objetivo de venta"
              />
            </label>
            <label className="field">
              Condición
              <select
                value={direction}
                onChange={(event) => setDirection(event.target.value as AlertDirection)}
              >
                <option value="ABOVE">El precio sube por encima de</option>
                <option value="BELOW">El precio baja por debajo de</option>
              </select>
            </label>
            <label className="field">
              Umbral (€)
              <input
                type="number"
                step="0.01"
                min="0"
                value={threshold}
                onChange={(event) => setThreshold(event.target.value)}
                placeholder="2500"
              />
            </label>
            <label className="field checkbox">
              <input
                type="checkbox"
                checked={repeatable}
                onChange={(event) => setRepeatable(event.target.checked)}
              />
              Repetir cada vez que se cruce el umbral
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? 'Creando…' : 'Crear alerta'}
            </button>
            <span className="hint">
              El servidor comprueba el precio periódicamente, también con el navegador cerrado.
            </span>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="section-header">
          <h2>Alertas configuradas</h2>
        </div>
        {loading ? (
          <div className="empty">Cargando alertas…</div>
        ) : alerts.length === 0 ? (
          <div className="empty">No hay alertas configuradas todavía.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Condición</th>
                  <th className="num">Umbral</th>
                  <th>Estado</th>
                  <th>Último disparo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {alerts.map((alert) => (
                  <tr key={alert.id}>
                    <td>{alert.label}</td>
                    <td>{alert.direction === 'ABOVE' ? 'Por encima de' : 'Por debajo de'}</td>
                    <td className="num">{formatEur(alert.thresholdEur)}</td>
                    <td>
                      <span className={`tag ${alert.enabled ? 'buy' : 'off'}`}>
                        {alert.enabled ? 'Activa' : 'Inactiva'}
                      </span>
                      {alert.repeat ? <span className="hint"> · repetible</span> : null}
                    </td>
                    <td className="hint">{formatDateTime(alert.lastTriggeredAt)}</td>
                    <td className="num">
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => void toggleAlert(alert)}
                      >
                        {alert.enabled ? 'Desactivar' : 'Activar'}
                      </button>{' '}
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={() => void removeAlert(alert)}
                      >
                        Borrar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <div className="section-header">
          <h2>Historial de avisos</h2>
          <button
            type="button"
            className="btn small"
            disabled={unreadCount === 0}
            onClick={() => void acknowledgeAll()}
          >
            Marcar todo como leído
          </button>
        </div>
        {events.length === 0 ? (
          <div className="empty">Ninguna alerta se ha disparado todavía.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Alerta</th>
                  <th className="num">Precio</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id}>
                    <td>{formatDateTime(event.triggeredAt)}</td>
                    <td>
                      {event.label}{' '}
                      <span className="hint">
                        ({event.direction === 'ABOVE' ? '≥' : '≤'} {formatEur(event.thresholdEur)})
                      </span>
                    </td>
                    <td className="num">{formatEur(event.priceEur)}</td>
                    <td>
                      <span className={`tag ${event.acknowledged ? 'off' : 'sell'}`}>
                        {event.acknowledged ? 'Leído' : 'Nuevo'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
