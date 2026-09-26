import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatDate, formatDateTime, formatEth, formatEur } from '../lib/format';
import type { PricePoint, Transaction } from '../types';

interface PriceChartProps {
  points: PricePoint[];
  transactions: Transaction[];
  loading: boolean;
  livePoint?: PricePoint | null;
}

interface ChartDatum {
  ts: number;
  price: number;
}

interface Marker {
  ts: number;
  price: number;
  transaction: Transaction;
}

function buildMarkers(transactions: Transaction[], data: ChartDatum[]): Marker[] {
  if (data.length === 0) return [];
  const from = data[0].ts;
  const to = data[data.length - 1].ts;

  return transactions
    .map((transaction) => ({
      // Sin hora se sitúa a mediodía, para que el punto caiga dentro del día correspondiente.
      ts: new Date(`${transaction.date}T${transaction.time ?? '12:00'}:00`).getTime(),
      price: transaction.priceEur,
      transaction,
    }))
    .filter((marker) => marker.ts >= from && marker.ts <= to)
    // Las ventas se pintan las últimas para que nunca queden ocultas bajo una compra cercana.
    .sort((a, b) => Number(a.transaction.type === 'SELL') - Number(b.transaction.type === 'SELL'));
}

function markerLabel(transaction: Transaction): string {
  const kind = transaction.type === 'BUY' ? 'Compra' : 'Venta';
  const when = `${formatDate(transaction.date)}${transaction.time ? ` ${transaction.time}` : ''}`;
  return `${kind} · ${when} · ${formatEur(transaction.amountEur)} · ${formatEth(
    transaction.ethQty,
  )} · ${formatEur(transaction.priceEur, true)}/ETH`;
}

/**
 * Recharts ignora los hijos de ReferenceDot, así que el marcador y su texto emergente se
 * construyen aquí. Las compras se dibujan justo debajo del precio apuntando hacia arriba y las
 * ventas justo encima apuntando hacia abajo: así nunca se tapan aunque coincidan en precio y hora.
 */
function renderMarker(marker: Marker) {
  return (props: { cx?: number; cy?: number }) => {
    const cx = props.cx ?? 0;
    const cy = props.cy ?? 0;
    const isBuy = marker.transaction.type === 'BUY';
    const points = isBuy
      ? `${cx},${cy + 3} ${cx - 6},${cy + 13} ${cx + 6},${cy + 13}`
      : `${cx},${cy - 3} ${cx - 6},${cy - 13} ${cx + 6},${cy - 13}`;

    return (
      <g>
        <polygon
          points={points}
          fill={isBuy ? '#3ddc97' : '#ff6b81'}
          stroke="#0b1020"
          strokeWidth={1.5}
        />
        <title>{markerLabel(marker.transaction)}</title>
      </g>
    );
  };
}

function renderLiveDot(price: number) {
  return (props: { cx?: number; cy?: number }) => {
    const cx = props.cx ?? 0;
    const cy = props.cy ?? 0;
    return (
      <g>
        <circle cx={cx} cy={cy} r={9} fill="#7c9cff" opacity={0.22} />
        <circle cx={cx} cy={cy} r={4} fill="#7c9cff" stroke="#0b1020" strokeWidth={1.5} />
        <title>{`Precio ahora: ${formatEur(price, true)}`}</title>
      </g>
    );
  };
}

export function PriceChart({ points, transactions, loading, livePoint }: PriceChartProps) {
  const data = useMemo<ChartDatum[]>(() => {
    const base = points.map((point) => ({
      ts: new Date(point.ts).getTime(),
      price: point.priceEur,
    }));

    if (!livePoint || base.length === 0) return base;

    // El histórico de CoinGecko se cachea varios minutos: se prolonga con el precio en vivo
    // para que el extremo derecho del gráfico coincida siempre con la cotización actual.
    const liveTs = new Date(livePoint.ts).getTime();
    if (!Number.isFinite(liveTs)) return base;

    const last = base[base.length - 1];
    if (liveTs > last.ts) return [...base, { ts: liveTs, price: livePoint.priceEur }];
    if (liveTs === last.ts) {
      return [...base.slice(0, -1), { ts: liveTs, price: livePoint.priceEur }];
    }
    return base;
  }, [points, livePoint]);

  const markers = useMemo(() => buildMarkers(transactions, data), [transactions, data]);
  const lastPoint = data.length > 0 ? data[data.length - 1] : null;

  if (loading && data.length === 0) {
    return <div className="empty">Cargando histórico de precios…</div>;
  }

  if (data.length === 0) {
    return <div className="empty">No hay datos de precio disponibles ahora mismo.</div>;
  }

  const prices = data.map((datum) => datum.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = (max - min) * 0.08 || max * 0.02;

  return (
    <ResponsiveContainer width="100%" height={320}>
      <AreaChart data={data} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7c9cff" stopOpacity={0.45} />
            <stop offset="100%" stopColor="#7c9cff" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#242c48" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="ts"
          type="number"
          domain={['dataMin', 'dataMax']}
          scale="time"
          tick={{ fill: '#94a0c0', fontSize: 12 }}
          stroke="#242c48"
          tickFormatter={(value: number) =>
            new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
          }
          minTickGap={40}
        />
        <YAxis
          domain={[min - padding, max + padding]}
          tick={{ fill: '#94a0c0', fontSize: 12 }}
          stroke="#242c48"
          width={72}
          tickFormatter={(value: number) => `${Math.round(value).toLocaleString('es-ES')} €`}
        />
        <Tooltip
          contentStyle={{
            background: '#141a2e',
            border: '1px solid #242c48',
            borderRadius: 10,
            color: '#e8ecf8',
          }}
          labelFormatter={(value) => formatDateTime(new Date(Number(value)).toISOString())}
          formatter={(value: number) => [formatEur(value), 'Precio ETH']}
        />
        <Area
          type="monotone"
          dataKey="price"
          stroke="#7c9cff"
          strokeWidth={2}
          fill="url(#priceFill)"
          isAnimationActive={false}
        />
        {lastPoint && livePoint ? (
          <ReferenceDot
            x={lastPoint.ts}
            y={lastPoint.price}
            shape={renderLiveDot(lastPoint.price)}
            ifOverflow="extendDomain"
          />
        ) : null}
        {markers.map((marker) => (
          <ReferenceDot
            key={marker.transaction.id}
            x={marker.ts}
            y={marker.price}
            shape={renderMarker(marker)}
            ifOverflow="extendDomain"
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
