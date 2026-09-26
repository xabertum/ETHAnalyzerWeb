import { LocalNotifications } from '@capacitor/local-notifications';
import type { AlertEvent } from '../../types';

const CHANNEL_ID = 'eth-price-alerts';

let permissionChecked = false;

function describe(event: AlertEvent): string {
  const direction = event.direction === 'ABOVE' ? 'ha superado' : 'ha bajado de';
  const format = (value: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value);
  return `ETH ${direction} ${format(event.thresholdEur)} · precio actual ${format(event.priceEur)}`;
}

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    let status = await LocalNotifications.checkPermissions();
    if (status.display === 'prompt' || status.display === 'prompt-with-rationale') {
      status = await LocalNotifications.requestPermissions();
    }

    if (status.display === 'granted' && !permissionChecked) {
      permissionChecked = true;
      await LocalNotifications.createChannel({
        id: CHANNEL_ID,
        name: 'Alertas de precio',
        description: 'Avisos cuando ETH cruza un umbral configurado',
        importance: 4,
        visibility: 1,
      }).catch(() => undefined);
    }

    return status.display === 'granted';
  } catch {
    return false;
  }
}

export async function notifyAlertEvents(events: AlertEvent[]): Promise<void> {
  if (events.length === 0) return;
  if (!(await ensureNotificationPermission())) return;

  try {
    await LocalNotifications.schedule({
      notifications: events.map((event) => ({
        // Un id estable por evento evita duplicados si se reintenta el aviso.
        id: 100_000 + event.id,
        title: `🔔 ${event.label}`,
        body: describe(event),
        channelId: CHANNEL_ID,
      })),
    });
  } catch {
    /* si el aviso falla, el evento sigue visible dentro de la app */
  }
}
