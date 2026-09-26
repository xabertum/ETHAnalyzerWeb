import type { PortfolioSummary, Transaction } from '../types.js';
import { getCurrentPrice } from './priceService.js';
import { listTransactions } from './transactionService.js';

const EPSILON = 1e-12;

interface CostBasisResult {
  ethQty: number;
  costBasis: number;
  realizedPnl: number;
  totalBought: number;
  totalSold: number;
  costOfSold: number;
  ethSold: number;
}

/** Coste medio ponderado: cada venta reduce cantidad y coste de forma proporcional. */
export function computeCostBasis(transactions: Transaction[]): CostBasisResult {
  let ethQty = 0;
  let costBasis = 0;
  let realizedPnl = 0;
  let totalBought = 0;
  let totalSold = 0;
  let costOfSold = 0;
  let ethSold = 0;

  const ordered = [...transactions].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    const byTime = (a.time ?? '00:00').localeCompare(b.time ?? '00:00');
    return byTime !== 0 ? byTime : a.id - b.id;
  });

  for (const tx of ordered) {
    if (tx.type === 'BUY') {
      ethQty += tx.ethQty;
      costBasis += tx.amountEur;
      totalBought += tx.amountEur;
      continue;
    }

    totalSold += tx.amountEur;
    const soldQty = Math.min(tx.ethQty, ethQty);
    const avgCost = ethQty > EPSILON ? costBasis / ethQty : 0;
    const costOfThisSale = avgCost * soldQty;
    realizedPnl += tx.amountEur - costOfThisSale;
    costOfSold += costOfThisSale;
    ethSold += soldQty;
    ethQty = Math.max(0, ethQty - soldQty);
    costBasis = Math.max(0, costBasis - costOfThisSale);
  }

  if (ethQty < EPSILON) {
    ethQty = 0;
    costBasis = 0;
  }

  return { ethQty, costBasis, realizedPnl, totalBought, totalSold, costOfSold, ethSold };
}

export async function getPortfolioSummary(): Promise<PortfolioSummary> {
  const transactions = listTransactions();
  const { ethQty, costBasis, realizedPnl, totalBought, totalSold, costOfSold, ethSold } =
    computeCostBasis(transactions);

  let currentPrice: number | null = null;
  let priceUpdatedAt: string | null = null;
  let priceChange24h: number | null = null;
  try {
    const quote = await getCurrentPrice();
    currentPrice = quote.priceEur;
    priceUpdatedAt = quote.updatedAt;
    priceChange24h = quote.change24h;
  } catch {
    currentPrice = null;
  }

  const currentValue = currentPrice === null ? null : ethQty * currentPrice;
  const unrealizedPnl = currentValue === null ? null : currentValue - costBasis;
  const unrealizedPnlPct =
    unrealizedPnl === null || costBasis <= EPSILON ? null : (unrealizedPnl / costBasis) * 100;
  const investedNet = totalBought - totalSold;
  // Criterio de la hoja "Inversión Crypto": valor actual menos el dinero neto aportado, es decir
  // sin contar como inversión el importe de las ventas que se reinvierte en nuevas compras.
  const totalPnl = currentValue === null ? null : currentValue - investedNet;
  const totalPnlPct =
    totalPnl === null || investedNet <= EPSILON ? null : (totalPnl / investedNet) * 100;

  return {
    ethQty,
    totalBought,
    totalSold,
    investedNet,
    costBasis,
    averageBuyPrice: ethQty > EPSILON ? costBasis / ethQty : null,
    currentPrice,
    currentValue,
    unrealizedPnl,
    unrealizedPnlPct,
    realizedPnl,
    costOfSold,
    ethSold,
    realizedPnlPct: costOfSold > EPSILON ? (realizedPnl / costOfSold) * 100 : null,
    totalPnl,
    totalPnlPct,
    priceUpdatedAt,
    priceChange24h,
    transactionCount: transactions.length,
    firstTransactionDate: transactions.length ? transactions[0].date : null,
    lastTransactionDate: transactions.length ? transactions[transactions.length - 1].date : null,
  };
}
