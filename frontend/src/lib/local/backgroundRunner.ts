import type { Alert } from '../../types';

const LABEL = 'com.ethanalyzer.app.alerts';

/**
 * Envía las alertas activas al runner de segundo plano, que mantiene su propia copia
 * porque se ejecuta en un contexto aislado del almacenamiento de la aplicación.
 */
export async function syncAlertsToRunner(alerts: Alert[]): Promise<void> {
  try {
    const { BackgroundRunner } = await import('@capacitor/background-runner');
    await BackgroundRunner.dispatchEvent({
      label: LABEL,
      event: 'syncAlerts',
      details: {
        alerts: alerts
          .filter((alert) => alert.enabled)
          .map((alert) => ({
            id: alert.id,
            label: alert.label,
            direction: alert.direction,
            thresholdEur: alert.thresholdEur,
            enabled: alert.enabled,
          })),
      },
    });
  } catch {
    /* sin runner disponible la app sigue comprobando alertas en primer plano */
  }
}

export async function requestBackgroundPermissions(): Promise<void> {
  try {
    const { BackgroundRunner } = await import('@capacitor/background-runner');
    await BackgroundRunner.requestPermissions({ apis: ['notifications'] });
  } catch {
    /* el permiso también se solicita desde LocalNotifications */
  }
}
