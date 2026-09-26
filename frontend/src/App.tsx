import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Suspense, lazy, useEffect, useState } from 'react';
import { AlertWatcherProvider, useAlertWatcher } from './components/AlertWatcher';
import { BottomNav } from './components/BottomNav';
import { api } from './lib/api';
import { REFRESH_INTERVAL_MS } from './lib/constants';
import { isNativePlatform } from './lib/dataSource';
import { formatEur, formatPct, formatTime, sign } from './lib/format';
import { DashboardPage } from './pages/DashboardPage';
import { TransactionsPage } from './pages/TransactionsPage';
import { AlertsPage } from './pages/AlertsPage';
import type { PriceQuote } from './types';

const isNative = isNativePlatform();

// Solo existe en la app nativa, así que se carga aparte y no engorda el bundle de la web.
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);

function PricePill() {
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const next = await api.getCurrentPrice();
        if (active) {
          setQuote(next);
          setFetchedAt(new Date());
        }
      } catch {
        /* el dashboard ya muestra el error */
      }
    };
    void load();
    const timer = setInterval(() => void load(), REFRESH_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (!quote) return null;

  return (
    <div
      className="price-pill"
      title={
        quote.stale
          ? 'Precio en caché (CoinGecko no responde)'
          : `Dato de CoinGecko del ${new Date(quote.updatedAt).toLocaleString('es-ES')}`
      }
    >
      <span>ETH {formatEur(quote.priceEur)}</span>
      <span className={sign(quote.change24h)}>{formatPct(quote.change24h)}</span>
      <span className="pill-time">{formatTime(fetchedAt)}</span>
      {quote.stale ? <span className="neutral">⚠</span> : null}
    </div>
  );
}

function TopNavigation() {
  const { unreadCount } = useAlertWatcher();

  return (
    <nav className="nav">
      <NavLink to="/dashboard">Dashboard</NavLink>
      <NavLink to="/operaciones">Operaciones</NavLink>
      <NavLink to="/alertas">
        Alertas
        {unreadCount > 0 ? <span className="badge">{unreadCount}</span> : null}
      </NavLink>
    </nav>
  );
}

/** En la app nativa la navegación vive en la barra inferior, no en la cabecera. */
function MobileNavigation() {
  const { unreadCount } = useAlertWatcher();
  return <BottomNav unreadCount={unreadCount} />;
}

export default function App() {
  return (
    <AlertWatcherProvider>
      <div className={`app${isNative ? ' app-native' : ''}`}>
        <header className="topbar">
          <div className="brand">
            <span className="logo">Ξ</span>
            <span>ETH Analyzer</span>
          </div>
          {isNative ? null : <TopNavigation />}
          <PricePill />
        </header>

        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/operaciones" element={<TransactionsPage />} />
          <Route path="/alertas" element={<AlertsPage />} />
          {isNative ? (
            <Route
              path="/ajustes"
              element={
                <Suspense fallback={<div className="empty">Cargando ajustes…</div>}>
                  <SettingsPage />
                </Suspense>
              }
            />
          ) : null}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>

        {isNative ? <MobileNavigation /> : null}
      </div>
    </AlertWatcherProvider>
  );
}
