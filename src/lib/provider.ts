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

const FINNHUB = "https://finnhub.io/api/v1";
const POLYGON = "https://api.polygon.io";

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

// ─────────────────────────── Quotes ───────────────────────────

export async function getQuote(symbol: string): Promise<Quote> {
  const sym = symbol.toUpperCase();

  if (PROVIDER === "polygon") {
    const key = requireKey(POLYGON_KEY, "POLYGON_API_KEY");
    const data = await getJSON<any>(
      `${POLYGON}/v2/aggs/ticker/${sym}/prev?adjusted=true&apiKey=${key}`
    );
    const r = data?.results?.[0];
    if (!r) throw new ProviderError(`No quote for ${sym}.`, 404);
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
    };
  }

  const key = requireKey(FINNHUB_KEY, "FINNHUB_API_KEY");
  const q = await getJSON<any>(`${FINNHUB}/quote?symbol=${sym}&token=${key}`);
  // Finnhub returns { c, d, dp, h, l, o, pc }; c === 0 means unknown symbol.
  if (q.c === 0 && q.pc === 0) throw new ProviderError(`No quote for ${sym}.`, 404);
  return {
    symbol: sym,
    current: q.c,
    change: q.d,
    percentChange: q.dp,
    high: q.h,
    low: q.l,
    open: q.o,
    previousClose: q.pc,
  };
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

/** Real daily closes from Yahoo Finance (no API key required). */
async function getYahooCloses(sym: string, days: number): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const period1 = new Date();
  period1.setDate(period1.getDate() - days);
  // chart() is the supported successor to the deprecated historical() method.
  const result = await yahooFinance.chart(sym, { period1, interval: "1d" });
  for (const row of result?.quotes ?? []) {
    const close = row.close ?? row.adjclose;
    if (row.date && close != null) out.set(iso(new Date(row.date)), Number(close));
  }
  return out;
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
async function getDailyCloses(symbol: string, days: number): Promise<Map<string, number>> {
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
      if (out.size) return out;
    } catch {
      /* fall through */
    }
  }

  // Primary real source on free setups: Yahoo Finance (no key).
  try {
    const yahoo = await getYahooCloses(sym, days);
    if (yahoo.size) return yahoo;
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
        if (out.size) return out;
      }
    } catch {
      /* fall through to synthetic */
    }
  }

  // Synthetic fallback: anchor on the live price and walk backwards with a
  // deterministic drift so the same symbol always yields the same curve.
  let anchor = 100;
  try {
    anchor = (await getQuote(sym)).current || 100;
  } catch {
    /* keep default anchor */
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
  return out;
}

/** Aggregate per-symbol close series into a single portfolio value series. */
export async function getPortfolioHistory(
  holdings: Pick<Holding, "symbol" | "shares">[],
  days: number
): Promise<HistoryPoint[]> {
  if (!holdings.length) return [];

  const series = await Promise.all(
    holdings.map(async (h) => ({
      shares: h.shares,
      closes: await getDailyCloses(h.symbol, days),
    }))
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
      value += last[i] * s.shares;
    });
    points.push({ date, value: Number(value.toFixed(2)) });
  }
  return points;
}

export { ProviderError };
