import { Router } from 'express';
import { z } from 'zod';
import {
  acknowledgeAllEvents,
  acknowledgeEvent,
  createAlert,
  deleteAlert,
  listAlertEvents,
  listAlerts,
  updateAlert,
} from '../services/alertService.js';

export const alertsRouter = Router();

const alertSchema = z.object({
  label: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  direction: z.enum(['ABOVE', 'BELOW']),
  thresholdEur: z.number().positive('El umbral debe ser mayor que 0'),
  enabled: z.boolean().optional(),
  repeatable: z.boolean().optional(),
});

const idSchema = z.coerce.number().int().positive();

alertsRouter.get('/', (_req, res) => {
  res.json(listAlerts());
});

alertsRouter.post('/', (req, res) => {
  const parsed = alertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  return res.status(201).json(createAlert(parsed.data));
});

alertsRouter.put('/:id', (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Id inválido' });
  const parsed = alertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Datos inválidos', details: parsed.error.flatten() });
  }
  const updated = updateAlert(id.data, parsed.data);
  if (!updated) return res.status(404).json({ error: 'Alerta no encontrada' });
  return res.json(updated);
});

alertsRouter.delete('/:id', (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Id inválido' });
  if (!deleteAlert(id.data)) return res.status(404).json({ error: 'Alerta no encontrada' });
  return res.status(204).send();
});

alertsRouter.get('/events', (req, res) => {
  const limit = z.coerce.number().int().min(1).max(200).catch(50).parse(req.query.limit ?? 50);
  const onlyUnread = req.query.unread === 'true';
  res.json(listAlertEvents(limit, onlyUnread));
});

alertsRouter.post('/events/ack', (_req, res) => {
  res.json({ acknowledged: acknowledgeAllEvents() });
});

alertsRouter.post('/events/:id/ack', (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Id inválido' });
  if (!acknowledgeEvent(id.data)) return res.status(404).json({ error: 'Evento no encontrado' });
  return res.status(204).send();
});
