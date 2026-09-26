export type TransactionType = 'BUY' | 'SELL';

export interface Transaction {
  id: number;
  date: string;
  time: string | null;
  type: TransactionType;
  amountEur: number;
  priceEur: number;
  ethQty: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionInput {
  date: string;
  time?: string | null;
  type: TransactionType;
  amountEur: number;
  priceEur: number;
  ethQty: number;
  note?: string | null;
}

export interface PriceQuote {
  priceEur: number;
  change24h: number | null;
  marketCapEur: number | null;
  volume24hEur: number | null;
  updatedAt: string;
  stale: boolean;
}

export interface PricePoint {
  ts: string;
  priceEur: number;
}

export interface PriceHistory {
  days: string;
  points: PricePoint[];
}

export interface PortfolioSummary {
  ethQty: number;
  totalBought: number;
  totalSold: number;
  investedNet: number;
  costBasis: number;
  averageBuyPrice: number | null;
  currentPrice: number | null;
  currentValue: number | null;
  unrealizedPnl: number | null;
  unrealizedPnlPct: number | null;
  realizedPnl: number;
  costOfSold: number;
  ethSold: number;
  realizedPnlPct: number | null;
  totalPnl: number | null;
  totalPnlPct: number | null;
  priceUpdatedAt: string | null;
  priceChange24h: number | null;
  transactionCount: number;
  firstTransactionDate: string | null;
  lastTransactionDate: string | null;
}

export type AlertDirection = 'ABOVE' | 'BELOW';

export interface Alert {
  id: number;
  label: string;
  direction: AlertDirection;
  thresholdEur: number;
  enabled: boolean;
  repeat: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
}

export interface AlertInput {
  label: string;
  direction: AlertDirection;
  thresholdEur: number;
  enabled?: boolean;
  repeatable?: boolean;
}

export interface AlertEvent {
  id: number;
  alertId: number;
  label: string;
  direction: AlertDirection;
  thresholdEur: number;
  triggeredAt: string;
  priceEur: number;
  acknowledged: boolean;
}
