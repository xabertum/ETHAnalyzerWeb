import type { Database } from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  time TEXT,
  type TEXT NOT NULL CHECK (type IN ('BUY', 'SELL')),
  amount_eur REAL NOT NULL,
  price_eur REAL NOT NULL,
  eth_qty REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (date);

CREATE TABLE IF NOT EXISTS price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  price_eur REAL NOT NULL,
  change_24h REAL
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_ts ON price_snapshots (ts);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('ABOVE', 'BELOW')),
  threshold_eur REAL NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  repeatable INTEGER NOT NULL DEFAULT 0,
  last_triggered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alert_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  alert_id INTEGER NOT NULL REFERENCES alerts (id) ON DELETE CASCADE,
  triggered_at TEXT NOT NULL,
  price_eur REAL NOT NULL,
  acknowledged INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_alert_events_triggered ON alert_events (triggered_at DESC);
`;

export function runMigrations(db: Database): void {
  db.exec(SCHEMA);
  addColumnIfMissing(db, 'transactions', 'time', 'TEXT');
}

/** Permite evolucionar el esquema sobre bases de datos ya creadas en el volumen. */
function addColumnIfMissing(
  db: Database,
  table: string,
  column: string,
  definition: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (columns.some((item) => item.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
