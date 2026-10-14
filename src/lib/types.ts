// Shared type definitions used across server routes, hooks, and components.

/** A single position the user holds in their portfolio. */
export interface Holding {
  id: string;
  symbol: string;
  shares: number;
  buyPrice: number;
  /** Manual price override in the ticker's native currency (null/undefined = live quotes). */
  manualPrice?: number | null;
}

/** Normalized real-time quote returned by /api/quote. */
export interface Quote {
  symbol: string;
  current: number;
  change: number;
  percentChange: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  /** Native trading currency of the quote, e.g. "USD", "JPY". */
  currency: string;
  /** Multiplier to convert native-currency amounts to USD (1 for USD). */
  usdRate: number;
}

/** A news article returned by the company/market news routes. */
export interface NewsArticle {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string;
  datetime: number; // unix seconds
  category: string;
  related: string; // comma-separated tickers, when available
}

/** A symbol-search match returned by /api/search. */
export interface SymbolMatch {
  symbol: string;
  description: string;
  type: string;
}

/** One point on the aggregated portfolio value time series. */
export interface HistoryPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

// ── AI daily stock analysis (/api/analysis/[symbol]) ──

export type AnalysisDriver = "Macro" | "Micro" | "Both";
export type AnalysisTrajectory = "Transitory Noise" | "Structural Shift";

/** AI-generated daily movement diagnosis for one ticker. */
export interface DailyAnalysis {
  symbol: string;
  date: string; // YYYY-MM-DD (UTC)
  driver: AnalysisDriver;
  summary: string;
  trajectoryType: AnalysisTrajectory;
  longTermOutlook: string;
  priceChangePct: number | null; // the move being diagnosed
  cached: boolean; // true if served from the DB cache (no new tokens spent)
}

// ── Institutional & insider ownership (/api/ownership/[symbol]) ──

/** A single insider (director/executive) transaction. */
export interface InsiderTxn {
  name: string;
  date: string; // transaction date, YYYY-MM-DD
  code: string; // SEC transaction code (P, S, A, M, G, …)
  shares: number; // shares transacted (absolute)
  change: number; // signed change in holdings (+ buy / − sell)
  price: number; // transaction price per share (0 if unknown)
  type: "buy" | "sell" | "other";
}

/** A top institutional holder. */
export interface TopHolder {
  name: string;
  shares: number | null;
  pctHeld: number | null; // percent of shares outstanding (0–100)
  change: number | null; // percent change in position (0–100), sign meaningful
}

/** Aggregated ownership + insider data for one ticker. */
export interface OwnershipData {
  symbol: string;
  institutional: {
    available: boolean;
    percentHeld: number | null; // % held by institutions (0–100)
    insiderPercentHeld: number | null; // % held by insiders (0–100)
    count: number | null; // number of institutional holders
    topHolders: TopHolder[];
    source: "finnhub" | "yahoo" | null;
  };
  insiderTransactions: InsiderTxn[];
  sentiment: {
    available: boolean;
    netShares: number; // net insider share change over the window
    avgMspr: number | null; // avg monthly share-purchase ratio (−100…100)
    label: "Net Buying" | "Net Selling" | "Neutral";
    months: { year: number; month: number; change: number; mspr: number }[];
  };
}
