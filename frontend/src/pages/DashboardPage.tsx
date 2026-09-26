import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KpiCard } from '../components/KpiCard';
import { LastUpdated } from '../components/LastUpdated';
import { PriceChart } from '../components/PriceChart';
import { api } from '../lib/api';
import { HISTORY_REFRESH_INTERVAL_MS, REFRESH_INTERVAL_MS } from '../lib/constants';
import {
  daysSince,
  formatDate,
  formatDateTime,
  formatDays,
  formatEth,
  formatEur,
  formatPct,
  formatSignedEur,
  sign,
} from '../lib/format';
import type { PortfolioSummary, PricePoint, Transaction } from '../types';

const RANGES = [
  { label: '24 h', value: '1' },
  { label: '7 d', value: '7' },
  { label: '30 d', value: '30' },
  { label: '90 d', value: '90' },
  { label: '1 año', value: '365' },
  { label: 'Máx', value: 'max' },
];

export function DashboardPage() {
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [points, setPoints] = useState<PricePoint[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [range, setRange] = useState('30');
  const [loadingChart, setLoadingChart] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const historyRequest = useRef(0);

  const loadSummary = useCallback(async () => {
    try {
      const [nextSummary, nextTransactions] = await Promise.all([
        api.getPortfolioSummary(),
        api.listTransactions(),
      ]);
      setSummary(nextSummary);
      setTransactions(nextTransactions);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la cartera');
    }
  }, []);

  const loadHistory = useCallback(
    async (showSpinner = false) => {
      const requestId = ++historyRequest.current;
      if (showSpinner) setLoadingChart(true);
      try {
        const history = await api.getPriceHistory(range);
        // Se descarta la respuesta si entretanto se ha pedido otro rango.
        if (historyRequest.current === requestId) setPoints(history.points);
      } catch {
        if (historyRequest.current === requestId && showSpinner) setPoints([]);
      } finally {
        if (historyRequest.current === requestId && showSpinner) setLoadingChart(false);
      }
    },
    [range],
  );

  const refreshNow = useCallback(async () => {
    setRefreshing(true);
    try {
      await api.getCurrentPrice(true);
    } catch {
      /* si CoinGecko falla se usa el último precio conocido */
    }
    await Promise.all([loadSummary(), loadHistory()]);
    setRefreshing(false);
  }, [loadSummary, loadHistory]);

  useEffect(() => {
    void loadSummary();
    const timer = setInterval(() => void loadSummary(), REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadSummary]);

  useEffect(() => {
    void loadHistory(true);
    const timer = setInterval(() => void loadHistory(), HISTORY_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [loadHistory]);

  const priceStale = summary?.currentPrice === null;

  const operationCounts = useMemo(() => {
    const buys = transactions.filter((transaction) => transaction.type === 'BUY').length;
    return { buys, sells: transactions.length - buys };
  }, [transactions]);

  const daysSinceFirst = daysSince(summary?.firstTransactionDate);
  const daysSinceLast = daysSince(summary?.lastTransactionDate);

  const livePoint = useMemo(
    () =>
      summary?.currentPrice != null && summary.priceUpdatedAt
        ? { ts: summary.priceUpdatedAt, priceEur: summary.currentPrice }
        : null,
    [summary],
  );

  return (
    <div className="stack">
      {error ? <div className="error-banner">{error}</div> : null}
      {priceStale ? (
        <div className="warn-banner">
          No se ha podido obtener el precio actual de CoinGecko. Las métricas de valoración se
          muestran vacías.
        </div>
      ) : null}

      <section className="section-header dashboard-header">
        <h2>Resumen de cartera</h2>
        <LastUpdated
          at={lastUpdated}
          intervalMs={REFRESH_INTERVAL_MS}
          onRefresh={() => void refreshNow()}
          refreshing={refreshing}
        />
      </section>

      <section className="kpi-grid">
        <KpiCard
          label="Precio ETH"
          value={formatEur(summary?.currentPrice, true)}
          hint={
            <span className={sign(summary?.priceChange24h)}>
              {formatPct(summary?.priceChange24h)} en 24 h
            </span>
          }
        />
        <KpiCard
          label="Valor actual"
          value={formatEur(summary?.currentValue)}
          hint={formatEth(summary?.ethQty)}
        />
        <KpiCard
          label="Coste de la posición"
          value={formatEur(summary?.costBasis)}
          hint={`Precio medio de compra: ${formatEur(summary?.averageBuyPrice, true)}`}
        />
        <KpiCard
          label="Ganancia latente"
          value={formatSignedEur(summary?.unrealizedPnl)}
          tone={sign(summary?.unrealizedPnl)}
          hint={
            <>
              <span className={sign(summary?.unrealizedPnlPct)}>
                {formatPct(summary?.unrealizedPnlPct)}
              </span>
              <span className="kpi-formula">
                Valor actual − coste de la posición ({formatEur(summary?.currentValue)} −{' '}
                {formatEur(summary?.costBasis)})
              </span>
            </>
          }
        />
        <KpiCard
          label="Coste de lo vendido"
          value={formatEur(summary?.costOfSold)}
          hint={
            <>
              {formatEth(summary?.ethSold)} vendidos · cobrado {formatEur(summary?.totalSold)}
              <span className="kpi-formula">Precio medio de compra × ETH vendidos</span>
            </>
          }
        />
        <KpiCard
          label="Ganancia materializada"
          value={formatSignedEur(summary?.realizedPnl)}
          tone={sign(summary?.realizedPnl)}
          hint={
            <>
              <span className={sign(summary?.realizedPnlPct)}>
                {formatPct(summary?.realizedPnlPct)}
              </span>
              <span className="kpi-formula">
                Ventas − coste de lo vendido ({formatEur(summary?.totalSold)} −{' '}
                {formatEur(summary?.costOfSold)})
              </span>
            </>
          }
        />
        <KpiCard
          label="Resultado total"
          value={formatSignedEur(summary?.totalPnl)}
          tone={sign(summary?.totalPnl)}
          hint={
            <>
              <span className={sign(summary?.totalPnlPct)}>{formatPct(summary?.totalPnlPct)}</span>
              <span className="kpi-formula">
                Valor actual − invertido neto ({formatEur(summary?.currentValue)} −{' '}
                {formatEur(summary?.investedNet)})
              </span>
            </>
          }
        />
        <KpiCard
          label="Invertido (neto)"
          value={formatEur(summary?.investedNet)}
          hint={
            <>
              Comprado: {formatEur(summary?.totalBought)} · vendido:{' '}
              {formatEur(summary?.totalSold)}
              <span className="kpi-formula">
                Dinero aportado: total comprado − total vendido
              </span>
            </>
          }
        />
        <KpiCard
          label="Antigüedad de la cartera"
          value={formatDays(daysSinceFirst)}
          hint={
            <>
              Desde la primera operación: {formatDate(summary?.firstTransactionDate)}
              <span className="kpi-formula">
                Última operación:{' '}
                {daysSinceLast === null
                  ? '—'
                  : daysSinceLast === 0
                    ? 'hoy'
                    : `hace ${formatDays(daysSinceLast).toLowerCase()}`}{' '}
                ({formatDate(summary?.lastTransactionDate)})
              </span>
            </>
          }
        />
        <KpiCard
          label="Operaciones"
          value={summary?.transactionCount ?? '—'}
          hint={
            summary?.transactionCount
              ? `${operationCounts.buys} compras · ${operationCounts.sells} ventas`
              : 'Sin operaciones'
          }
        />
      </section>

      <section className="card chart-card">
        <div className="section-header">
          <h2>Precio de ETH</h2>
          <div className="range-group">
            {RANGES.map((option) => (
              <button
                key={option.value}
                type="button"
                className={range === option.value ? 'active' : ''}
                onClick={() => setRange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <PriceChart
          points={points}
          transactions={transactions}
          loading={loadingChart}
          livePoint={livePoint}
        />
        <div className="chart-legend">
          <span className="legend-item">
            <span className="legend-marker buy" /> Compra
          </span>
          <span className="legend-item">
            <span className="legend-marker sell" /> Venta
          </span>
          <span className="legend-item">
            <span className="legend-marker live" /> Precio ahora
          </span>
          <span className="hint">
            Pasa el ratón por encima de un marcador para ver el detalle de la operación. Datos de
            CoinGecko
            {summary?.priceUpdatedAt ? ` · actualizado ${formatDateTime(summary.priceUpdatedAt)}` : ''}.
          </span>
        </div>
      </section>
    </div>
  );
}
