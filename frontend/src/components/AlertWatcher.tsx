import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';
import { formatEur } from '../lib/format';
import type { AlertEvent } from '../types';
import { useToast } from './ToastProvider';

const POLL_INTERVAL_MS = 30_000;

interface AlertWatcherValue {
  events: AlertEvent[];
  unreadCount: number;
  refresh: () => Promise<void>;
  acknowledgeAll: () => Promise<void>;
  notificationsEnabled: boolean;
  requestNotifications: () => Promise<void>;
}

const AlertWatcherContext = createContext<AlertWatcherValue | null>(null);

function describe(event: AlertEvent): string {
  const direction = event.direction === 'ABOVE' ? 'ha superado' : 'ha bajado de';
  return `ETH ${direction} ${formatEur(event.thresholdEur)} · precio actual ${formatEur(event.priceEur)}`;
}

export function AlertWatcherProvider({ children }: { children: ReactNode }) {
  const { push } = useToast();
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted',
  );
  const seenIds = useRef<Set<number> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const latest = await api.listAlertEvents({ limit: 100 });
      setEvents(latest);

      // El primer ciclo solo sincroniza: no avisa de eventos anteriores a la carga.
      if (seenIds.current === null) {
        seenIds.current = new Set(latest.map((event) => event.id));
        return;
      }

      const fresh = latest.filter((event) => !seenIds.current!.has(event.id));
      for (const event of fresh) {
        seenIds.current.add(event.id);
        push({ kind: 'alert', title: `🔔 ${event.label}`, body: describe(event) });
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          new Notification(`ETH Analyzer · ${event.label}`, { body: describe(event) });
        }
      }
    } catch {
      /* el poller reintenta en el siguiente ciclo */
    }
  }, [push]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const acknowledgeAll = useCallback(async () => {
    await api.acknowledgeAllEvents();
    await refresh();
  }, [refresh]);

  const requestNotifications = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const permission = await Notification.requestPermission();
    setNotificationsEnabled(permission === 'granted');
  }, []);

  const value = useMemo<AlertWatcherValue>(
    () => ({
      events,
      unreadCount: events.filter((event) => !event.acknowledged).length,
      refresh,
      acknowledgeAll,
      notificationsEnabled,
      requestNotifications,
    }),
    [events, refresh, acknowledgeAll, notificationsEnabled, requestNotifications],
  );

  return <AlertWatcherContext.Provider value={value}>{children}</AlertWatcherContext.Provider>;
}

export function useAlertWatcher(): AlertWatcherValue {
  const context = useContext(AlertWatcherContext);
  if (!context) throw new Error('useAlertWatcher debe usarse dentro de AlertWatcherProvider');
  return context;
}
