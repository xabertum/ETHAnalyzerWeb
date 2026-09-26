import { createApp } from './app.js';
import { config } from './config.js';
import { closeDb, getDb } from './db/index.js';
import { logger } from './logger.js';
import { startAlertPoller, stopAlertPoller } from './services/alertService.js';

getDb();

const app = createApp();
const server = app.listen(config.port, () => {
  logger.info(`API escuchando en el puerto ${config.port}`);
  startAlertPoller();
});

function shutdown(signal: string): void {
  logger.info(`Recibido ${signal}, cerrando...`);
  stopAlertPoller();
  server.close(() => {
    closeDb();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
