import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { runMigrations } from './migrations.js';

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;

  const dir = path.dirname(config.dbPath);
  fs.mkdirSync(dir, { recursive: true });

  instance = new Database(config.dbPath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');
  runMigrations(instance);
  logger.info(`SQLite listo en ${config.dbPath}`);
  return instance;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}
