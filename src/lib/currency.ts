// Client-safe currency helpers (no server-only imports).
//
// When a live quote is available it carries the authoritative `currency` and
// `usdRate`. These helpers are the fallback for when a quote is unavailable
// (e.g. a foreign exchange our free data source can't reach), so a holding is
// still shown roughly in USD instead of mistaking ¥4,057 for $4,057.

/** Map a ticker's exchange suffix to its trading currency. */
const SUFFIX_CURRENCY: Record<string, string> = {
  T: "JPY", // Tokyo
  HK: "HKD", // Hong Kong
  SS: "CNY", // Shanghai
  SZ: "CNY", // Shenzhen
  KS: "KRW", // Korea (KOSPI)
  KQ: "KRW", // Korea (KOSDAQ)
  TW: "TWD", // Taiwan
  AX: "AUD", // Australia
  NS: "INR", // India (NSE)
  BO: "INR", // India (BSE)
  SI: "SGD", // Singapore
  TO: "CAD", // Toronto
  V: "CAD", // TSX Venture
};

/** Infer the native currency from a ticker symbol (defaults to USD). */
export function inferCurrency(symbol: string): string {
  const i = symbol.lastIndexOf(".");
  if (i === -1) return "USD";
  return SUFFIX_CURRENCY[symbol.slice(i + 1).toUpperCase()] ?? "USD";
}

/**
 * Approximate native→USD rates, used only as a last resort when no live quote
 * (and therefore no live FX rate) is available. Intentionally rough.
 */
export const APPROX_USD_RATE: Record<string, number> = {
  USD: 1,
  JPY: 0.0067,
  HKD: 0.128,
  CNY: 0.14,
  KRW: 0.00072,
  TWD: 0.031,
  AUD: 0.66,
  INR: 0.012,
  SGD: 0.74,
  CAD: 0.73,
};

/** Best-effort native→USD multiplier for a currency with no live rate. */
export function approxUsdRate(currency: string): number {
  return APPROX_USD_RATE[currency.toUpperCase()] ?? 1;
}
