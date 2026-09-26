import { useEffect, useState } from 'react';
import { formatTime } from '../lib/format';

interface LastUpdatedProps {
  at: Date | null;
  intervalMs: number;
  onRefresh?: () => void;
  refreshing?: boolean;
}

function elapsedLabel(at: Date | null, now: number): string {
  if (!at) return '';
  const seconds = Math.max(0, Math.round((now - at.getTime()) / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.floor(minutes / 60)} h`;
}

export function LastUpdated({ at, intervalMs, onRefresh, refreshing }: LastUpdatedProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="refresh-info">
      <span className="hint">
        {at ? (
          <>
            Última actualización: <strong>{formatTime(at)}</strong> ({elapsedLabel(at, now)})
          </>
        ) : (
          'Cargando datos…'
        )}{' '}
        · se actualiza cada {Math.round(intervalMs / 1000)} s
      </span>
      {onRefresh ? (
        <button type="button" className="btn small" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? 'Actualizando…' : 'Actualizar ahora'}
        </button>
      ) : null}
    </div>
  );
}
