import { getDb } from '../db/index.js';
import type { Transaction, TransactionType } from '../types.js';

interface TransactionRow {
  id: number;
  date: string;
  time: string | null;
  type: TransactionType;
  amount_eur: number;
  price_eur: number;
  eth_qty: number;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionInput {
  date: string;
  time?: string | null;
  type: TransactionType;
  amountEur: number;
  priceEur: number;
  ethQty: number;
  note?: string | null;
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    type: row.type,
    amountEur: row.amount_eur,
    priceEur: row.price_eur,
    ethQty: row.eth_qty,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listTransactions(): Transaction[] {
  const rows = getDb()
    .prepare<[], TransactionRow>(
      `SELECT * FROM transactions
        ORDER BY date ASC, COALESCE(time, '00:00') ASC, id ASC`,
    )
    .all();
  return rows.map(toTransaction);
}

export function getTransaction(id: number): Transaction | null {
  const row = getDb()
    .prepare<[number], TransactionRow>('SELECT * FROM transactions WHERE id = ?')
    .get(id);
  return row ? toTransaction(row) : null;
}

export function createTransaction(input: TransactionInput): Transaction {
  const result = getDb()
    .prepare(
      `INSERT INTO transactions (date, time, type, amount_eur, price_eur, eth_qty, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.date,
      input.time ?? null,
      input.type,
      input.amountEur,
      input.priceEur,
      input.ethQty,
      input.note ?? null,
    );
  return getTransaction(Number(result.lastInsertRowid))!;
}

export function updateTransaction(id: number, input: TransactionInput): Transaction | null {
  const result = getDb()
    .prepare(
      `UPDATE transactions
          SET date = ?, time = ?, type = ?, amount_eur = ?, price_eur = ?, eth_qty = ?, note = ?,
              updated_at = datetime('now')
        WHERE id = ?`,
    )
    .run(
      input.date,
      input.time ?? null,
      input.type,
      input.amountEur,
      input.priceEur,
      input.ethQty,
      input.note ?? null,
      id,
    );
  if (result.changes === 0) return null;
  return getTransaction(id);
}

export function deleteTransaction(id: number): boolean {
  const result = getDb().prepare('DELETE FROM transactions WHERE id = ?').run(id);
  return result.changes > 0;
}
