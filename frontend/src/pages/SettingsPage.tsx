import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useToast } from '../components/ToastProvider';

interface Status {
  transactions: number;
  alerts: number;
}

export function SettingsPage() {
  const { push } = useToast();
  const [host, setHost] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [notificationsGranted, setNotificationsGranted] = useState<boolean | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void (async () => {
      const { readDb } = await import('../lib/local/storage');
      const db = await readDb();
      setStatus({ transactions: db.transactions.length, alerts: db.alerts.length });
    })();
  }, []);

  async function refreshStatus(): Promise<void> {
    const { readDb } = await import('../lib/local/storage');
    const db = await readDb();
    setStatus({ transactions: db.transactions.length, alerts: db.alerts.length });
  }

  async function handleImportFromPc(): Promise<void> {
    const target = host.trim();
    if (!target) {
      setError('Indica la dirección del backend, por ejemplo http://192.168.1.50:4000');
      return;
    }

    const url = /^https?:\/\//i.test(target) ? target : `http://${target}`;
    if (
      !window.confirm(
        'Se reemplazarán las operaciones y alertas guardadas en este móvil por las del PC. ¿Continuar?',
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const { importFromBackend } = await import('../lib/local/transfer');
      const result = await importFromBackend(url);
      await refreshStatus();
      push({
        kind: 'success',
        title: 'Importación completada',
        body: `${result.transactions} operaciones y ${result.alerts} alertas`,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? `No se pudo conectar: ${err.message}`
          : 'No se pudo conectar con el PC',
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleExport(): Promise<void> {
    setBusy(true);
    try {
      const { exportBackup } = await import('../lib/local/transfer');
      const payload = await exportBackup();
      const text = JSON.stringify(payload, null, 2);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `eth-analyzer-${payload.exportedAt.slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      push({ kind: 'success', title: 'Copia de seguridad generada' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo exportar');
    } finally {
      setBusy(false);
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!window.confirm('Se reemplazarán los datos actuales del móvil. ¿Continuar?')) return;

    setBusy(true);
    setError(null);
    try {
      const { importBackup } = await import('../lib/local/transfer');
      const result = await importBackup(await file.text());
      await refreshStatus();
      push({
        kind: 'success',
        title: 'Copia restaurada',
        body: `${result.transactions} operaciones y ${result.alerts} alertas`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo importar el fichero');
    } finally {
      setBusy(false);
    }
  }

  async function handleNotifications(): Promise<void> {
    const { ensureNotificationPermission } = await import('../lib/local/notifications');
    setNotificationsGranted(await ensureNotificationPermission());
  }

  return (
    <div className="stack">
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="card">
        <div className="section-header">
          <h2>Datos de este dispositivo</h2>
        </div>
        <p className="hint">
          {status
            ? `${status.transactions} operaciones · ${status.alerts} alertas guardadas en el móvil.`
            : 'Cargando…'}{' '}
          Los datos de la app son independientes de los de la web.
        </p>
      </section>

      <section className="card">
        <div className="section-header">
          <h2>Importar desde el PC</h2>
        </div>
        <p className="hint">
          Con el móvil en la misma wifi que el ordenador, indica la dirección del backend. La
          importación <strong>sustituye</strong> los datos actuales del móvil.
        </p>
        <div className="form-grid">
          <label className="field">
            Dirección del backend
            <input
              type="url"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              value={host}
              onChange={(event) => setHost(event.target.value)}
              placeholder="http://192.168.1.50:4000"
            />
          </label>
        </div>
        <div className="form-actions">
          <button
            type="button"
            className="btn primary"
            disabled={busy}
            onClick={() => void handleImportFromPc()}
          >
            {busy ? 'Importando…' : 'Importar del PC'}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="section-header">
          <h2>Copia de seguridad</h2>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" disabled={busy} onClick={() => void handleExport()}>
            Exportar a fichero
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
          >
            Restaurar desde fichero
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => void handleFile(event)}
          />
        </div>
      </section>

      <section className="card">
        <div className="section-header">
          <h2>Notificaciones</h2>
        </div>
        <p className="hint">
          Las alertas se comprueban en segundo plano aproximadamente cada 15 minutos. Para que
          lleguen con puntualidad, excluye la app del ahorro de batería en los ajustes de Android.
        </p>
        <div className="form-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => void handleNotifications()}
          >
            Permitir notificaciones
          </button>
          {notificationsGranted !== null ? (
            <span className="hint">
              {notificationsGranted ? 'Permiso concedido.' : 'Permiso denegado.'}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
