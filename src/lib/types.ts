// Shared type definitions used across server routes, hooks, and components.

/** A single position the user holds in their portfolio. */
export interface Holding {
  id: string;
  symbol: string;
  shares: number;
  buyPrice: number;
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
