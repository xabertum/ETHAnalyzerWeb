import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { nowHhMm, todayIso } from '../lib/format';
import type { Transaction, TransactionInput, TransactionType } from '../types';

type NumericField = 'amountEur' | 'priceEur' | 'ethQty';

interface TransactionFormProps {
  initial?: Transaction | null;
  saving: boolean;
  onSubmit: (input: TransactionInput) => void;
  onCancel?: () => void;
}

function toInputValue(value: number | undefined, digits: number): string {
  if (value === undefined || Number.isNaN(value)) return '';
  return String(Number(value.toFixed(digits)));
}

export function TransactionForm({ initial, saving, onSubmit, onCancel }: TransactionFormProps) {
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState(nowHhMm());
  const [type, setType] = useState<TransactionType>('BUY');
  const [amountEur, setAmountEur] = useState('');
  const [priceEur, setPriceEur] = useState('');
  const [ethQty, setEthQty] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Los dos últimos campos numéricos editados determinan cuál se autocalcula.
  const editOrder = useRef<NumericField[]>(['amountEur', 'priceEur']);

  useEffect(() => {
    setError(null);
    if (initial) {
      setDate(initial.date);
      setTime(initial.time ?? '');
      setType(initial.type);
      setAmountEur(toInputValue(initial.amountEur, 2));
      setPriceEur(toInputValue(initial.priceEur, 4));
      setEthQty(toInputValue(initial.ethQty, 8));
      setNote(initial.note ?? '');
    } else {
      setDate(todayIso());
      setTime(nowHhMm());
      setType('BUY');
      setAmountEur('');
      setPriceEur('');
      setEthQty('');
      setNote('');
    }
    editOrder.current = ['amountEur', 'priceEur'];
  }, [initial]);

  const values = useMemo(
    () => ({
      amountEur: Number(amountEur.replace(',', '.')),
      priceEur: Number(priceEur.replace(',', '.')),
      ethQty: Number(ethQty.replace(',', '.')),
    }),
    [amountEur, priceEur, ethQty],
  );

  function registerEdit(field: NumericField): NumericField {
    const order = editOrder.current.filter((item) => item !== field);
    order.push(field);
    editOrder.current = order.slice(-2);
    const all: NumericField[] = ['amountEur', 'priceEur', 'ethQty'];
    return all.find((item) => !editOrder.current.includes(item))!;
  }

  function handleNumericChange(field: NumericField, raw: string): void {
    const setters: Record<NumericField, (value: string) => void> = {
      amountEur: setAmountEur,
      priceEur: setPriceEur,
      ethQty: setEthQty,
    };
    setters[field](raw);

    const derived = registerEdit(field);
    const next = { ...values, [field]: Number(raw.replace(',', '.')) };

    const amount = next.amountEur;
    const price = next.priceEur;
    const qty = next.ethQty;

    if (derived === 'ethQty' && amount > 0 && price > 0) {
      setEthQty(toInputValue(amount / price, 8));
    } else if (derived === 'priceEur' && amount > 0 && qty > 0) {
      setPriceEur(toInputValue(amount / qty, 4));
    } else if (derived === 'amountEur' && price > 0 && qty > 0) {
      setAmountEur(toInputValue(price * qty, 2));
    }
  }

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    const { amountEur: amount, priceEur: price, ethQty: qty } = values;

    if (!date) return setError('Indica la fecha de la operación');
    if (!(amount > 0)) return setError('El importe debe ser mayor que 0');
    if (!(price > 0)) return setError('El precio debe ser mayor que 0');
    if (!(qty > 0)) return setError('La cantidad de ETH debe ser mayor que 0');

    setError(null);
    onSubmit({
      date,
      time: time ? time : null,
      type,
      amountEur: Number(amount.toFixed(2)),
      priceEur: Number(price.toFixed(6)),
      ethQty: Number(qty.toFixed(10)),
      note: note.trim() ? note.trim() : null,
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="form-grid">
        <label className="field">
          Fecha
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
        </label>
        <label className="field">
          Hora
          <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
        </label>
        <label className="field">
          Operación
          <select value={type} onChange={(event) => setType(event.target.value as TransactionType)}>
            <option value="BUY">Compra</option>
            <option value="SELL">Venta</option>
          </select>
        </label>
        <label className="field">
          Importe (€)
          <input
            type="number"
            step="0.01"
            min="0"
            value={amountEur}
            onChange={(event) => handleNumericChange('amountEur', event.target.value)}
            placeholder="100.00"
          />
        </label>
        <label className="field">
          Precio (€/ETH)
          <input
            type="number"
            step="0.01"
            min="0"
            value={priceEur}
            onChange={(event) => handleNumericChange('priceEur', event.target.value)}
            placeholder="2126.86"
          />
        </label>
        <label className="field">
          Cantidad ETH
          <input
            type="number"
            step="0.00000001"
            min="0"
            value={ethQty}
            onChange={(event) => handleNumericChange('ethQty', event.target.value)}
            placeholder="0.04701700"
          />
        </label>
        <label className="field">
          Nota (opcional)
          <input
            type="text"
            value={note}
            maxLength={280}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Exchange, comentario…"
          />
        </label>
      </div>
      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? 'Guardando…' : initial ? 'Guardar cambios' : 'Añadir operación'}
        </button>
        {onCancel ? (
          <button type="button" className="btn" onClick={onCancel} disabled={saving}>
            Cancelar
          </button>
        ) : null}
        <span className="hint">
          Rellena dos de los tres campos numéricos y el tercero se calcula solo.
        </span>
      </div>
    </form>
  );
}
