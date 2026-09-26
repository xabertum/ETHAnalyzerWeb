import { Router } from 'express';
import { z } from 'zod';
import { getCurrentPrice, getPriceHistory } from '../services/priceService.js';

export const priceRouter = Router();

const daysSchema = z.enum(['1', '7', '30', '90', '180', '365', 'max']).default('30');

priceRouter.get('/current', async (req, res, next) => {
  try {
    const force = req.query.refresh === 'true';
    res.json(await getCurrentPrice(force));
  } catch (error) {
    next(error);
  }
});

priceRouter.get('/history', async (req, res, next) => {
  const parsed = daysSchema.safeParse(req.query.days ?? '30');
  if (!parsed.success) {
    return res.status(400).json({ error: 'Rango no soportado (1, 7, 30, 90, 180, 365 o max)' });
  }
  try {
    const points = await getPriceHistory(parsed.data);
    return res.json({ days: parsed.data, points });
  } catch (error) {
    return next(error);
  }
});
