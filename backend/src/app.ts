import express from 'express';
import cors from 'cors';
import { logger } from './logger.js';
import { transactionsRouter } from './routes/transactions.js';
import { priceRouter } from './routes/price.js';
import { portfolioRouter } from './routes/portfolio.js';
import { alertsRouter } from './routes/alerts.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  });

  app.use('/api/transactions', transactionsRouter);
  app.use('/api/price', priceRouter);
  app.use('/api/portfolio', portfolioRouter);
  app.use('/api/alerts', alertsRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Endpoint no encontrado' });
  });

  app.use(
    (
      error: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ): void => {
      logger.error('Error no controlado', error);
      res.status(500).json({ error: 'Error interno del servidor', message: error.message });
    },
  );

  return app;
}
