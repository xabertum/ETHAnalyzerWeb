import { useCallback, useEffect, useMemo, useState } from 'react';
import { TransactionForm } from '../components/TransactionForm';
import { useToast } from '../components/ToastProvider';
import { api } from '../lib/api';
import { formatDate, formatEth, formatEur } from '../lib/format';
import type { Transaction, TransactionInput } from '../types';

export function TransactionsPage() {
  const { push } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setTransactions(await api.listTransactions());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron cargar las operaciones');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    let bought = 0;
    let sold = 0;
    let qty = 0;
    for (const tx of transactions) {
      if (tx.type === 'BUY') {
        bought += tx.amountEur;
        qty += tx.ethQty;
      } else {
        sold += tx.amountEur;
        qty -= tx.ethQty;
      }
    }
    return { bought, sold, qty };
  }, [transactions]);

  async function handleSubmit(input: TransactionInput): Promise<void> {
    setSaving(true);
    try {
      if (editing) {
        await api.updateTransaction(editing.id, input);
        push({ kind: 'success', title: 'Operación actualizada' });
        setEditing(null);
      } else {
        await api.createTransaction(input);
        push({ kind: 'success', title: 'Operación añadida' });
      }
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'No se pudo guardar',
        body: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(transaction: Transaction): Promise<void> {
    const label = `${transaction.type === 'BUY' ? 'compra' : 'venta'} del ${formatDate(transaction.date)}`;
    if (!window.confirm(`¿Eliminar la ${label}?`)) return;
    try {
      await api.deleteTransaction(transaction.id);
      if (editing?.id === transaction.id) setEditing(null);
      push({ kind: 'success', title: 'Operación eliminada' });
      await load();
    } catch (err) {
      push({
        kind: 'error',
        title: 'No se pudo eliminar',
        body: err instanceof Error ? err.message : undefined,
      });
    }
  }

  return (
    <div className="stack">
      {error ? <div className="error-banner">{error}</div> : null}

      <section className="card">
        <div className="section-header">
          <h2>{editing ? 'Editar operación' : 'Nueva operación'}</h2>
        </div>
        <TransactionForm
          initial={editing}
          saving={saving}
          onSubmit={handleSubmit}
          onCancel={editing ? () => setEditing(null) : undefined}
        />
      </section>

      <section className="card">
        <div className="section-header">
          <h2>Histórico de operaciones</h2>
          <span className="hint">
            {transactions.length} operaciones · comprado {formatEur(totals.bought)} · vendido{' '}
            {formatEur(totals.sold)} · saldo {formatEth(totals.qty)}
          </span>
        </div>

        {loading ? (
          <div className="empty">Cargando operaciones…</div>
        ) : transactions.length === 0 ? (
          <div className="empty">
            Todavía no hay operaciones. Añade la primera con el formulario de arriba o importa el
            Excel con <code>npm run import:excel</code>.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Hora</th>
                  <th>Tipo</th>
                  <th className="num">Importe</th>
                  <th className="num">Precio</th>
                  <th className="num">Cantidad ETH</th>
                  <th>Nota</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {transactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{formatDate(transaction.date)}</td>
                    <td className={transaction.time ? '' : 'hint'}>{transaction.time ?? '—'}</td>
                    <td>
                      <span className={`tag ${transaction.type === 'BUY' ? 'buy' : 'sell'}`}>
                        {transaction.type === 'BUY' ? 'Compra' : 'Venta'}
                      </span>
                    </td>
                    <td className="num">{formatEur(transaction.amountEur)}</td>
                    <td className="num">{formatEur(transaction.priceEur, true)}</td>
                    <td className="num">{formatEth(transaction.ethQty)}</td>
                    <td className="hint">{transaction.note ?? '—'}</td>
                    <td className="num">
                      <button
                        type="button"
                        className="btn small"
                        onClick={() => {
                          setEditing(transaction);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        Editar
                      </button>{' '}
                      <button
                        type="button"
                        className="btn small danger"
                        onClick={() => void handleDelete(transaction)}
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
    </div>
  );
}
