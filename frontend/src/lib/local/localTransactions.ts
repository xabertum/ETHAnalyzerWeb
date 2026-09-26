import type { Transaction, TransactionInput } from '../../types';
import { mutateDb, readDb } from './storage';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Mismas reglas que el esquema zod del backend, para que ambas plataformas coincidan. */
export function validateTransaction(input: TransactionInput): Required<TransactionInput> {
  if (!DATE_RE.test(input.date) || Number.isNaN(Date.parse(input.date))) {
    throw new ValidationError('La fecha debe tener formato YYYY-MM-DD');
  }
  if (input.time != null && input.time !== '' && !TIME_RE.test(input.time)) {
    throw new ValidationError('La hora debe tener formato HH:MM');
  }
  if (input.type !== 'BUY' && input.type !== 'SELL') {
    throw new ValidationError('Tipo de operación no válido');
  }
  if (!(input.amountEur > 0)) throw new ValidationError('El importe debe ser mayor que 0');
  if (!(input.priceEur > 0)) throw new ValidationError('El precio debe ser mayor que 0');
  if (!(input.ethQty > 0)) throw new ValidationError('La cantidad de ETH debe ser mayor que 0');

  return {
    date: input.date,
    time: input.time ? input.time : null,
    type: input.type,
    amountEur: input.amountEur,
    priceEur: input.priceEur,
    ethQty: input.ethQty,
    note: input.note?.trim() ? input.note.trim().slice(0, 280) : null,
  };
}

function byChronology(a: Transaction, b: Transaction): number {
  const byDate = a.date.localeCompare(b.date);
  if (byDate !== 0) return byDate;
  const byTime = (a.time ?? '00:00').localeCompare(b.time ?? '00:00');
  return byTime !== 0 ? byTime : a.id - b.id;
}

export async function listTransactions(): Promise<Transaction[]> {
  const db = await readDb();
  return [...db.transactions].sort(byChronology);
}

export async function createTransaction(input: TransactionInput): Promise<Transaction> {
  const data = validateTransaction(input);
  return mutateDb((db) => {
    const now = new Date().toISOString();
    const transaction: Transaction = {
      id: ++db.sequences.transaction,
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    db.transactions = [...db.transactions, transaction];
    return transaction;
  });
}

export async function updateTransaction(
  id: number,
  input: TransactionInput,
): Promise<Transaction> {
  const data = validateTransaction(input);
  return mutateDb((db) => {
    const index = db.transactions.findIndex((item) => item.id === id);
    if (index === -1) throw new ValidationError('Operación no encontrada');
    const updated: Transaction = {
      ...db.transactions[index],
      ...data,
      updatedAt: new Date().toISOString(),
    };
    db.transactions = db.transactions.map((item, i) => (i === index ? updated : item));
    return updated;
  });
}

export async function deleteTransaction(id: number): Promise<void> {
  await mutateDb((db) => {
    db.transactions = db.transactions.filter((item) => item.id !== id);
  });
}
