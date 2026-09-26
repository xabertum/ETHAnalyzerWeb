import { Router } from 'express';
import { z } from 'zod';
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from '../services/transactionService.js';

export const transactionsRouter = Router();

const transactionSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha debe tener formato YYYY-MM-DD')
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Fecha inválida'),
  time: z
    .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora debe tener formato HH:MM'), z.literal(''), z.null()])
    .optional()
    .transform((value) => (value ? value : null)),
  type: z.enum(['BUY', 'SELL']),
  amountEur: z.number().positive('El importe debe ser mayor que 0'),
  priceEur: z.number().positive('El precio debe ser mayor que 0'),
  ethQty: z.number().positive('La cantidad de ETH debe ser mayor que 0'),
  note: z.string().max(280).nullish(),
});

const idSchema = z.coerce.number().int().positive();

transactionsRouter.get('/', (_req, res) => {
  res.json(listTransactions());
});

transactionsRouter.get('/:id', (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Id inválido' });
  const tx = getTransaction(id.data);
  if (!tx) return res.status(404).json({ error: 'Operación no encontrada' });
  return res.json(tx);
});

transactionsRouter.post('/', (req, res) => {
  const parsed = transactionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  return res.status(201).json(createTransaction(parsed.data));
});

transactionsRouter.put('/:id', (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Id inválido' });
  const parsed = transactionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const updated = updateTransaction(id.data, parsed.data);
  if (!updated) return res.status(404).json({ error: 'Operación no encontrada' });
  return res.json(updated);
});

transactionsRouter.delete('/:id', (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Id inválido' });
  if (!deleteTransaction(id.data)) {
    return res.status(404).json({ error: 'Operación no encontrada' });
  }
  return res.status(204).send();
});
