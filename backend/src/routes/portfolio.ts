import { Router } from 'express';
import { getPortfolioSummary } from '../services/portfolioService.js';

export const portfolioRouter = Router();

portfolioRouter.get('/summary', async (_req, res, next) => {
  try {
    res.json(await getPortfolioSummary());
  } catch (error) {
    next(error);
  }
});
