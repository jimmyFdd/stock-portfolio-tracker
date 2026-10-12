// Server-only market-data provider abstraction.
//
// All outbound calls to Finnhub / Polygon happen here so the API key never
// reaches the browser. Route handlers import from this module exclusively.
//
// Switch providers with the PRICE_PROVIDER env var ("finnhub" | "polygon").
// Finnhub is the default because its free tier covers quotes AND news, which
// this app needs. Polygon is wired up for quotes/candles as an alternative.
//
// Historical candles come from yahoo-finance2 (no API key required), because
// Finnhub's /stock/candle endpoint is paywalled on free keys.

import "server-only";
import yahooFinance from "yahoo-finance2";
import type { Quote, NewsArticle, SymbolMatch, HistoryPoint, Holding } from "./types";

// Yahoo prints a one-time survey/notice to stdout on first use; silence it so it
// doesn't clutter server logs. Safe no-op if the API changes.
try {
  (yahooFinance as any).suppressNotices?.(["yahooSurvey", "ripHistorical"]);
} catch {
  /* ignore */
}

const PROVIDER = (process.env.PRICE_PROVIDER ?? "finnhub").toLowerCase();
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const POLYGON_KEY = process.env.POLYGON_API_KEY;
const TWELVEDATA_KEY = process.env.TWELVEDATA_API_KEY;

const FINNHUB = "https://finnhub.io/api/v1";
const POLYGON = "https://api.polygon.io";
const TWELVEDATA = "https://api.twelvedata.com";

// Map a Yahoo-style exchange suffix to the exchange name Twelve Data expects.
// Twelve Data uses `symbol=4044&exchange=JPX` rather than `4044.T`.
const SUFFIX_EXCHANGE: Record<string, string> = {
  T: "JPX", // Tokyo
  HK: "HKEX", // Hong Kong
  L: "LSE", // London
  SS: "SSE", // Shanghai
  SZ: "SZSE", // Shenzhen
  KS: "KRX", // Korea
  KQ: "KRX",
  TW: "TWSE", // Taiwan
  AX: "ASX", // Australia
  NS: "NSE", // India
  BO: "BSE",
  SI: "SGX", // Singapore
  TO: "TSX", // Toronto
  V: "TSXV",
};

/** Split "4044.T" into { base: "4044", exchange: "JPX" } for Twelve Data. */
function splitExchange(sym: string): { base: string; exchange: string } {
  const i = sym.lastIndexOf(".");
  if (i === -1) return { base: sym, exchange: "" };
  const exchange = SUFFIX_EXCHANGE[sym.slice(i + 1).toUpperCase()];
  return exchange ? { base: sym.slice(0, i), exchange } : { base: sym, exchange: "" };
}

class ProviderError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

function requireKey(key: string | undefined, name: string): string {
  if (!key) {
    throw new ProviderError(
      `${name} is not configured. Copy .env.local.example to .env.local and add your key.`,
      500
    );
  }
  return key;
}

/** Fetch JSON with a short revalidate window so bursts of clients share a cache. */
async function getJSON<T>(url: string, revalidate = 10): Promise<T> {
  const res = await fetch(url, { next: { revalidate } });
  if (res.status === 429) {
    throw new ProviderError("Upstream rate limit hit. Slow down polling.", 429);
  }
  if (!res.ok) {
    throw new ProviderError(`Upstream request failed (${res.status}).`, 502);
  }
  return (await res.json()) as T;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Yahoo rate-limits shared IPs; retry a chart() call a couple times on 429. */
async function yahooChart(sym: string, days: number): Promise<any> {
  const period1 = new Date();
  period1.setDate(period1.getDate() - days);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await yahooFinance.chart(sym, { period1, interval: "1d" });
    } catch (e) {
      lastErr = e;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// ─────────────────────────── FX (currency → USD) ───────────────────────────

const fxCache = new Map<string, { rate: number; ts: number }>();
const FX_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Last-resort approximate rates (native → USD), used ONLY when the live fetch
// fails and nothing is cached yet. Far better than defaulting to 1 (which would
// render ¥4,300 as $4,300). These are intentionally rough and go stale.
const FX_FALLBACK: Record<string, number> = {
  JPY: 0.0067,
  EUR: 1.08,
  GBP: 1.27,
  CHF: 1.12,
  CAD: 0.73,
  AUD: 0.66,
  HKD: 0.128,
  CNY: 0.14,
  KRW: 0.00072,
  INR: 0.012,
  TWD: 0.031,
  SGD: 0.74,
};

/**
 * Multiplier that converts an amount in `currency` into USD (1 for USD itself).
 * The rate comes from Yahoo Finance's `${CUR}USD=X` pair (e.g. JPYUSD=X) and is
 * cached for a few minutes so a portfolio of many ¥ tickers hits Yahoo once.
 */
export async function getUsdRate(currency: string): Promise<number> {
  const cur = (currency || "USD").toUpperCase();
  if (cur === "USD") return 1;

  const now = Date.now();
  const hit = fxCache.get(cur);
  if (hit && now - hit.ts < FX_TTL_MS) return hit.rate;

  let rate = hit?.rate ?? FX_FALLBACK[cur] ?? 1;

  // 1. Keyless FX APIs that are reliable from serverless/cloud IPs (unlike
  //    Yahoo, which rate-limits shared IPs). Each returns native → USD directly.
  const fxEndpoints = [
    {
      url: `https://api.frankfurter.dev/v1/latest?base=${cur}&symbols=USD`,
      pick: (d: any) => d?.rates?.USD,
    },
    {
      url: `https://open.er-api.com/v6/latest/${cur}`,
      pick: (d: any) => d?.rates?.USD,
    },
  ];
  for (const ep of fxEndpoints) {
    try {
      const res = await fetch(ep.url, { next: { revalidate: 600 } });
      if (!res.ok) continue;
      const r = ep.pick(await res.json());
      if (typeof r === "number" && r > 0) {
        fxCache.set(cur, { rate: r, ts: now });
        return r;
      }
    } catch {
      /* try next source */
    }
  }

  // 2. Yahoo FX pair as a last network source before the static fallback.
  try {
    const period1 = new Date();
    period1.setDate(period1.getDate() - 5);
    const y: any = await yahooFinance.chart(`${cur}USD=X`, { period1, interval: "1d" });
    const price = y?.meta?.regularMarketPrice;
    if (typeof price === "number" && price > 0) rate = price;
  } catch {
    /* keep last-known / fallback rate rather than failing the whole quote */
  }
  fxCache.set(cur, { rate, ts: now });
  return rate;
}

// ─────────────────────────── Quotes ───────────────────────────

/**
 * Normalized quote from Twelve Data — reliable for international tickers from
 * cloud IPs (where Yahoo throttles foreign exchanges). Reports native currency.
 * Note: the free plan covers US + FX; many foreign exchanges need a paid plan.
 */
async function getTwelveQuote(sym: string): Promise<Quote> {
  if (!TWELVEDATA_KEY) throw new ProviderError("TWELVEDATA_API_KEY not set.", 500);
  const { base, exchange } = splitExchange(sym);
  const params = new URLSearchParams({ symbol: base, apikey: TWELVEDATA_KEY });
  if (exchange) params.set("exchange", exchange);

  const d = await getJSON<any>(`${TWELVEDATA}/quote?${params.toString()}`, 10);
  // Twelve Data returns HTTP 200 with { status:"error", code, message } on
  // bad/plan-restricted symbols, so check the body rather than the status code.
  if (d?.status === "error" || d?.code) {
    throw new ProviderError(d?.message || `No quote for ${sym}.`, 404);
  }
  const current = Number(d.close);
  if (!Number.isFinite(current)) throw new ProviderError(`No quote for ${sym}.`, 404);

  const currency = (d.currency || "USD").toUpperCase();
  const previousClose = Number(d.previous_close) || current;
  const usdRate = await getUsdRate(currency);
  return {
    symbol: sym,
    current,
    change: current - previousClose,
    percentChange: previousClose ? ((current - previousClose) / previousClose) * 100 : 0,
    high: Number(d.high) || current,
    low: Number(d.low) || current,
    open: Number(d.open) || current,
    previousClose,
    currency,
    usdRate,
  };
}

/**
 * Normalized quote from Yahoo Finance. Handles foreign tickers (e.g. 4044.T)
 * and reports the native trading currency plus a USD conversion rate.
 *
 * Reads the live snapshot from chart()'s `meta` rather than the quote()
 * endpoint, which Yahoo heavily rate-limits ("Too Many Requests").
 */
async function getYahooQuote(sym: string): Promise<Quote> {
  const result: any = await yahooChart(sym, 5);
  const meta = result?.meta;
  const current = meta?.regularMarketPrice;
  if (meta == null || typeof current !== "number") {
    throw new ProviderError(`No quote for ${sym}.`, 404);
  }
  const currency = (meta.currency || "USD").toUpperCase();
  const previousClose = meta.chartPreviousClose ?? meta.previousClose ?? current;
  const usdRate = await getUsdRate(currency);
  return {
    symbol: sym,
    current,
    change: current - previousClose,
    percentChange: previousClose ? ((current - previousClose) / previousClose) * 100 : 0,
    high: meta.regularMarketDayHigh ?? current,
    low: meta.regularMarketDayLow ?? current,
    open: meta.regularMarketOpen ?? current,
    previousClose,
    currency,
    usdRate,
  };
}

export async function getQuote(symbol: string): Promise<Quote> {
  const sym = symbol.toUpperCase();

  // 1. Primary provider for US-listed tickers (quoted in USD).
  if (PROVIDER === "polygon" && POLYGON_KEY) {
    try {
      const data = await getJSON<any>(
        `${POLYGON}/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${POLYGON_KEY}`
      );
      const r = data?.results?.[0];
      if (r) {
        const current = r.c;
        const previousClose = r.o; // prev-day open as a rough previous reference
        return {
          symbol: sym,
          current,
          change: current - previousClose,
          percentChange: previousClose ? ((current - previousClose) / previousClose) * 100 : 0,
          high: r.h,
          low: r.l,
          open: r.o,
          previousClose,
          currency: "USD",
          usdRate: 1,
        };
      }
    } catch {
      /* fall through to Yahoo */
    }
  } else if (FINNHUB_KEY) {
    try {
      const q = await getJSON<any>(`${FINNHUB}/quote?symbol=${sym}&token=${FINNHUB_KEY}`);
      // Finnhub returns { c, d, dp, h, l, o, pc }; c === 0 && pc === 0 means no
      // data (common for non-US tickers like 4044.T) → fall back to Yahoo.
      if (!(q.c === 0 && q.pc === 0)) {
        return {
          symbol: sym,
          current: q.c,
          change: q.d,
          percentChange: q.dp,
          high: q.h,
          low: q.l,
          open: q.o,
          previousClose: q.pc,
          currency: "USD",
          usdRate: 1,
        };
      }
    } catch {
      /* fall through to Yahoo */
    }
  }

  // 2. Twelve Data — reliable for international tickers from cloud IPs (Yahoo
  //    throttles foreign exchanges from datacenters). Skipped if no key.
  if (TWELVEDATA_KEY) {
    try {
      return await getTwelveQuote(sym);
    } catch {
      /* fall through to Yahoo (e.g. plan-restricted symbol) */
    }
  }

  // 3. Fallback: Yahoo Finance — covers foreign tickers (works from residential
  //    IPs; foreign exchanges may be throttled from the cloud).
  return getYahooQuote(sym);
}

// ─────────────────────────── News ───────────────────────────

function normalizeFinnhubNews(items: any[]): NewsArticle[] {
  return (items ?? []).map((a) => ({
    id: String(a.id ?? `${a.datetime}-${a.headline}`),
    headline: a.headline ?? "",
    summary: a.summary ?? "",
    source: a.source ?? "",
    url: a.url ?? "",
    image: a.image ?? "",
    datetime: a.datetime ?? 0,
    category: a.category ?? "",
    related: a.related ?? "",
  }));
}

/** Micro news: company-specific, strictly for a single ticker. */
export async function getCompanyNews(symbol: string): Promise<NewsArticle[]> {
  const key = requireKey(FINNHUB_KEY, "FINNHUB_API_KEY");
  const sym = symbol.toUpperCase();
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 14); // last two weeks keeps it relevant
  const items = await getJSON<any[]>(
    `${FINNHUB}/company-news?symbol=${sym}&from=${iso(from)}&to=${iso(to)}&token=${key}`,
    60
  );
  return normalizeFinnhubNews(items).slice(0, 15);
}

/** Macro news: market-wide economy / Fed / sector trends. */
export async function getMarketNews(): Promise<NewsArticle[]> {
  const key = requireKey(FINNHUB_KEY, "FINNHUB_API_KEY");
  const items = await getJSON<any[]>(`${FINNHUB}/news?category=general&token=${key}`, 120);
  return normalizeFinnhubNews(items).slice(0, 25);
}

// ─────────────────────────── Symbol search ───────────────────────────

export async function searchSymbols(query: string): Promise<SymbolMatch[]> {
  const key = requireKey(FINNHUB_KEY, "FINNHUB_API_KEY");
  const data = await getJSON<any>(
    `${FINNHUB}/search?q=${encodeURIComponent(query)}&token=${key}`,
    300
  );
  return (data?.result ?? [])
    .filter((r: any) => r.type === "Common Stock" || r.type === "")
    .slice(0, 10)
    .map((r: any) => ({
      symbol: r.symbol,
      description: r.description,
      type: r.type,
    }));
}

// ─────────────────────────── Historical performance ───────────────────────────

/** A per-symbol close series together with its native trading currency. */
type CloseSeries = { closes: Map<string, number>; currency: string };

/** Real daily closes from Yahoo Finance (no API key required). */
async function getYahooCloses(sym: string, days: number): Promise<CloseSeries> {
  const closes = new Map<string, number>();
  // chart() is the supported successor to the deprecated historical() method.
  const result: any = await yahooChart(sym, days);
  const currency = (result?.meta?.currency || "USD").toUpperCase();
  for (const row of result?.quotes ?? []) {
    const close = row.close ?? row.adjclose;
    if (row.date && close != null) closes.set(iso(new Date(row.date)), Number(close));
  }
  return { closes, currency };
}

/** Daily closes from Twelve Data (reliable for foreign tickers from the cloud). */
async function getTwelveCloses(sym: string, days: number): Promise<CloseSeries> {
  if (!TWELVEDATA_KEY) throw new ProviderError("TWELVEDATA_API_KEY not set.", 500);
  const { base, exchange } = splitExchange(sym);
  const params = new URLSearchParams({
    symbol: base,
    interval: "1day",
    outputsize: String(Math.min(days + 5, 5000)),
    apikey: TWELVEDATA_KEY,
  });
  if (exchange) params.set("exchange", exchange);

  const d = await getJSON<any>(`${TWELVEDATA}/time_series?${params.toString()}`, 3600);
  if (d?.status === "error" || !Array.isArray(d?.values)) {
    throw new ProviderError(d?.message || `No history for ${sym}.`, 404);
  }
  const currency = (d?.meta?.currency || "USD").toUpperCase();
  const closes = new Map<string, number>();
  for (const row of d.values) {
    const c = Number(row.close);
    if (row.datetime && Number.isFinite(c)) closes.set(String(row.datetime).slice(0, 10), c);
  }
  return { closes, currency };
}

/**
 * Fetch a daily close series for one symbol over `days`.
 *
 * Source order:
 *   1. Polygon aggregates  — only when PRICE_PROVIDER=polygon and a key is set.
 *   2. Yahoo Finance       — real closes, NO API key (primary on free setups,
 *                            since Finnhub's /stock/candle is paywalled).
 *   3. Finnhub candles     — if the account's plan happens to allow them.
 *   4. Synthetic fallback  — deterministic curve anchored on the live quote, so
 *                            the chart still renders even fully offline.
 */
async function getDailyCloses(symbol: string, days: number): Promise<CloseSeries> {
  const sym = symbol.toUpperCase();
  const out = new Map<string, number>();

  if (PROVIDER === "polygon" && POLYGON_KEY) {
    const to = new Date();
    const from = new Date();
    from.setDate(to.getDate() - days);
    try {
      const data = await getJSON<any>(
        `${POLYGON}/v2/aggs/ticker/${sym}/range/1/day/${iso(from)}/${iso(to)}?adjusted=true&sort=asc&apiKey=${POLYGON_KEY}`,
        3600
      );
      for (const r of data?.results ?? []) {
        out.set(iso(new Date(r.t)), r.c);
      }
      if (out.size) return { closes: out, currency: "USD" };
    } catch {
      /* fall through */
    }
  }

  // For foreign tickers, prefer Twelve Data (Yahoo throttles foreign exchanges
  // from cloud IPs). US tickers skip this to conserve the Twelve Data quota.
  if (TWELVEDATA_KEY && splitExchange(sym).exchange) {
    try {
      const td = await getTwelveCloses(sym, days);
      if (td.closes.size) return td;
    } catch {
      /* fall through */
    }
  }

  // Primary real source on free setups: Yahoo Finance (no key). Carries the
  // native currency so foreign series can be converted to USD on aggregation.
  try {
    const yahoo = await getYahooCloses(sym, days);
    if (yahoo.closes.size) return yahoo;
  } catch {
    /* fall through */
  }

  if (FINNHUB_KEY) {
    const to = Math.floor(Date.now() / 1000);
    const from = to - days * 86400;
    try {
      const data = await getJSON<any>(
        `${FINNHUB}/stock/candle?symbol=${sym}&resolution=D&from=${from}&to=${to}&token=${FINNHUB_KEY}`,
        3600
      );
      if (data?.s === "ok" && Array.isArray(data.t)) {
        data.t.forEach((t: number, i: number) => out.set(iso(new Date(t * 1000)), data.c[i]));
        if (out.size) return { closes: out, currency: "USD" };
      }
    } catch {
      /* fall through to synthetic */
    }
  }

  // Synthetic fallback: anchor on the live price and walk backwards with a
  // deterministic drift so the same symbol always yields the same curve. The
  // anchor stays in the native currency; aggregation converts it to USD.
  let anchor = 100;
  let currency = "USD";
  try {
    const q = await getQuote(sym);
    anchor = q.current || 100;
    currency = q.currency;
  } catch {
    /* keep defaults */
  }
  let seed = 0;
  for (const ch of sym) seed += ch.charCodeAt(0);
  for (let i = days; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const wobble = Math.sin((i + seed) / 6) * 0.04 + Math.cos((i + seed) / 13) * 0.02;
    const drift = 1 - i * 0.0015; // mild upward trend toward today
    out.set(iso(d), Number((anchor * drift * (1 + wobble)).toFixed(2)));
  }
  return { closes: out, currency };
}

/**
 * Aggregate per-symbol close series into a single portfolio value series, with
 * every series converted to USD so a mixed-currency portfolio totals correctly.
 */
export async function getPortfolioHistory(
  holdings: Pick<Holding, "symbol" | "shares">[],
  days: number
): Promise<HistoryPoint[]> {
  if (!holdings.length) return [];

  const series = await Promise.all(
    holdings.map(async (h) => {
      const { closes, currency } = await getDailyCloses(h.symbol, days);
      const usdRate = await getUsdRate(currency);
      return { shares: h.shares, closes, usdRate };
    })
  );

  // Union of all dates across holdings, ascending.
  const dates = new Set<string>();
  for (const s of series) for (const d of s.closes.keys()) dates.add(d);
  const sorted = [...dates].sort();

  // Carry-forward last known close per symbol so missing days don't zero out.
  const last: number[] = series.map(() => 0);
  const points: HistoryPoint[] = [];
  for (const date of sorted) {
    let value = 0;
    series.forEach((s, i) => {
      const close = s.closes.get(date);
      if (close != null) last[i] = close;
      value += last[i] * s.shares * s.usdRate; // native → USD
    });
    points.push({ date, value: Number(value.toFixed(2)) });
  }
  return points;
}

export { ProviderError };
