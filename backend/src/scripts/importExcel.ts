import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { config } from '../config.js';
import { getDb, closeDb } from '../db/index.js';
import { logger } from '../logger.js';
import type { TransactionType } from '../types.js';

interface ParsedRow {
  row: number;
  date: string;
  time: string | null;
  type: TransactionType;
  amountEur: number;
  priceEur: number;
  ethQty: number;
}

const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

/** Excel guarda las fechas como serial; además aquí hay texto dd/mm/yy y dd/mm/yyyy. */
export function parseExcelDate(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = EXCEL_EPOCH_UTC + Math.round(value) * 86_400_000;
    return new Date(ms).toISOString().slice(0, 10);
  }

  const text = String(value).trim();
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/);
  if (match) {
    const day = Number(match[1]);
    const month = Number(match[2]);
    let year = Number(match[3]);
    if (year < 100) year += 2000;
    const date = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }

  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString().slice(0, 10);
}

/** La hoja guarda fechas sin hora, pero si la celda trae parte horaria se conserva. */
export function parseExcelTime(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;

  if (value instanceof Date) {
    const minutes = value.getUTCHours() * 60 + value.getUTCMinutes();
    return minutes === 0 ? null : value.toISOString().slice(11, 16);
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    const fraction = value - Math.floor(value);
    if (fraction <= 0) return null;
    const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const minutes = String(totalMinutes % 60).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  const match = String(value)
    .trim()
    .match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : null;
}

/** Las cantidades vienen como texto con coma o punto decimal, o como número. */
export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;

  if (typeof value === 'object') {
    const formula = value as { result?: unknown; value?: unknown };
    if (formula.result !== undefined) return parseNumber(formula.result);
    if (formula.value !== undefined) return parseNumber(formula.value);
    return null;
  }

  const text = String(value).trim().replace(/\s|€/g, '');
  if (!text) return null;

  // 1.234,56 -> 1234.56 ; 0,0045 -> 0.0045 ; 2126.86 -> 2126.86
  const normalized =
    text.includes(',') && text.includes('.')
      ? text.replace(/\./g, '').replace(',', '.')
      : text.replace(',', '.');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function cellValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  if (value && typeof value === 'object') {
    if ('result' in value) return (value as ExcelJS.CellFormulaValue).result;
    if ('richText' in value) return cell.text;
    if (value instanceof Date) return value;
  }
  return value;
}

function parseType(value: unknown): TransactionType | null {
  const text = String(value ?? '')
    .trim()
    .toLowerCase();
  if (text.startsWith('compra')) return 'BUY';
  if (text.startsWith('venta')) return 'SELL';
  return null;
}

export async function readTransactionsFromExcel(
  filePath: string,
  sheetName: string,
): Promise<ParsedRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet =
    workbook.getWorksheet(sheetName) ??
    workbook.worksheets.find((ws) => ws.name.trim().toLowerCase() === sheetName.trim().toLowerCase());

  if (!sheet) {
    const names = workbook.worksheets.map((ws) => ws.name).join(', ');
    throw new Error(`No existe la hoja "${sheetName}". Hojas disponibles: ${names}`);
  }

  const rows: ParsedRow[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 4) return; // filas 1-4: título y cabecera

    const amountEur = parseNumber(cellValue(row.getCell('C')));
    const rawDate = cellValue(row.getCell('D'));
    const date = parseExcelDate(rawDate);
    const time = parseExcelTime(rawDate);
    const priceEur = parseNumber(cellValue(row.getCell('E')));
    const ethQty = parseNumber(cellValue(row.getCell('F')));
    const type = parseType(cellValue(row.getCell('G')));

    if (!type || !date || amountEur === null || priceEur === null || ethQty === null) return;
    if (amountEur <= 0 || priceEur <= 0 || ethQty <= 0) return;

    rows.push({ row: rowNumber, date, time, type, amountEur, priceEur, ethQty });
  });

  return rows;
}

function report(rows: ParsedRow[]): void {
  const buys = rows.filter((r) => r.type === 'BUY');
  const sells = rows.filter((r) => r.type === 'SELL');
  const invested = buys.reduce((acc, r) => acc + r.amountEur, 0);
  const divested = sells.reduce((acc, r) => acc + r.amountEur, 0);
  const netEth =
    buys.reduce((acc, r) => acc + r.ethQty, 0) - sells.reduce((acc, r) => acc + r.ethQty, 0);

  logger.info(`Compras: ${buys.length} · Ventas: ${sells.length}`);
  logger.info(`Total comprado: ${invested.toFixed(2)} € · Total vendido: ${divested.toFixed(2)} €`);
  logger.info(`Cantidad neta de ETH: ${netEth.toFixed(8)}`);
}

async function main(): Promise<void> {
  const reset = process.argv.includes('--reset');
  const filePath = process.env.EXCEL_PATH ?? config.excelPath;

  if (!fs.existsSync(filePath)) {
    logger.error(`No se encuentra el fichero Excel: ${filePath}`);
    process.exitCode = 1;
    return;
  }

  logger.info(`Leyendo "${config.excelSheet}" de ${filePath}`);
  const rows = await readTransactionsFromExcel(filePath, config.excelSheet);

  if (rows.length === 0) {
    logger.warn('No se han encontrado operaciones válidas en la hoja');
    return;
  }

  report(rows);

  const db = getDb();
  const existing = db
    .prepare<[], { total: number }>('SELECT COUNT(*) AS total FROM transactions')
    .get()!.total;

  if (existing > 0 && !reset) {
    logger.warn(
      `La tabla transactions ya tiene ${existing} registros. Usa --reset para reemplazarlos.`,
    );
    return;
  }

  const insert = db.prepare(
    `INSERT INTO transactions (date, time, type, amount_eur, price_eur, eth_qty, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  db.transaction(() => {
    if (reset) {
      db.prepare('DELETE FROM transactions').run();
      db.prepare("DELETE FROM sqlite_sequence WHERE name = 'transactions'").run();
    }
    for (const row of rows) {
      insert.run(
        row.date,
        row.time,
        row.type,
        row.amountEur,
        row.priceEur,
        row.ethQty,
        `Importado del Excel (fila ${row.row})`,
      );
    }
  })();

  logger.info(`Importadas ${rows.length} operaciones en ${config.dbPath}`);
  closeDb();
}

const isDirectRun = process.argv[1]?.includes('importExcel');
if (isDirectRun) {
  main().catch((error) => {
    logger.error('Fallo en la importación', error);
    process.exitCode = 1;
  });
}
