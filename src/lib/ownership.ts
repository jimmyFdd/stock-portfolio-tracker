// Server-only: institutional ownership + insider activity for a ticker.
//
// Data sources (per the feature spec):
//   • Insider transactions  — Finnhub /stock/insider-transactions (free)
//   • Insider sentiment      — Finnhub /stock/insider-sentiment (free, MSPR)
//   • Institutional holdings — Finnhub /stock/ownership (PREMIUM → usually 403),
//                              falling back to Yahoo quoteSummary (keyless).
//
// Each section is fetched independently and degrades gracefully: a failure in
// one (e.g. Yahoo rate-limiting institutional data from a cloud IP) never blocks
// the others, so the reliable Finnhub insider data always comes through.

import "server-only";
import yahooFinance from "yahoo-finance2";
import type { OwnershipData, InsiderTxn, TopHolder } from "./types";

try {
  (yahooFinance as any).suppressNotices?.(["yahooSurvey"]);
} catch {
  /* ignore */
}

const FINNHUB = "https://finnhub.io/api/v1";
const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Classify an insider transaction by the signed change in holdings. */
function classify(change: number): InsiderTxn["type"] {
  if (change > 0) return "buy";
  if (change < 0) return "sell";
  return "other";
}

/** Finnhub insider transactions (SEC filings; US tickers). */
async function fetchInsiderTransactions(symbol: string): Promise<InsiderTxn[]> {
  if (!FINNHUB_KEY) return [];
  const res = await fetch(
    `${FINNHUB}/stock/insider-transactions?symbol=${symbol}&token=${FINNHUB_KEY}`,
    { next: { revalidate: 3600 } }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const rows: any[] = Array.isArray(data?.data) ? data.data : [];
  return rows
    .map((r) => ({
      name: r.name ?? "Unknown",
      date: r.transactionDate ?? r.filingDate ?? "",
      code: r.transactionCode ?? "",
      shares: Math.abs(Number(r.change) || 0),
      change: Number(r.change) || 0,
      price: Number(r.transactionPrice) || 0,
      type: classify(Number(r.change) || 0),
    }))
    .filter((t) => t.date)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 30);
}

/** Finnhub insider sentiment (MSPR) aggregated over the last ~6 months. */
async function fetchInsiderSentiment(symbol: string): Promise<OwnershipData["sentiment"]> {
  const empty: OwnershipData["sentiment"] = {
    available: false,
    netShares: 0,
    avgMspr: null,
    label: "Neutral",
    months: [],
  };
  if (!FINNHUB_KEY) return empty;

  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - 6);
  const res = await fetch(
    `${FINNHUB}/stock/insider-sentiment?symbol=${symbol}&from=${iso(from)}&to=${iso(to)}&token=${FINNHUB_KEY}`,
    { next: { revalidate: 3600 } }
  );
  if (!res.ok) return empty;
  const data = await res.json();
  const rows: any[] = Array.isArray(data?.data) ? data.data : [];
  if (!rows.length) return empty;

  const months = rows.map((r) => ({
    year: Number(r.year),
    month: Number(r.month),
    change: Number(r.change) || 0,
    mspr: Number(r.mspr) || 0,
  }));
  const netShares = months.reduce((s, m) => s + m.change, 0);
  const avgMspr = months.reduce((s, m) => s + m.mspr, 0) / months.length;
  // Label by net share flow, with a small dead-band around zero.
  const label =
    netShares > 0 ? "Net Buying" : netShares < 0 ? "Net Selling" : "Neutral";

  return { available: true, netShares, avgMspr, label, months };
}

/** Finnhub institutional ownership (premium on most plans → returns null). */
async function fetchFinnhubInstitutional(
  symbol: string
): Promise<{ topHolders: TopHolder[] } | null> {
  if (!FINNHUB_KEY) return null;
  try {
    const res = await fetch(
      `${FINNHUB}/stock/ownership?symbol=${symbol}&limit=10&token=${FINNHUB_KEY}`,
      { next: { revalidate: 21600 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const list: any[] = Array.isArray(data?.ownership) ? data.ownership : [];
    if (!list.length || data?.error) return null;
    return {
      topHolders: list.slice(0, 10).map((h) => ({
        name: h.name ?? "Unknown",
        shares: Number(h.share) || null,
        pctHeld: h.portfolioPercent != null ? Number(h.portfolioPercent) : null,
        change: h.change != null ? Number(h.change) : null,
      })),
    };
  } catch {
    return null;
  }
}

/** Yahoo quoteSummary institutional data (fallback; keyless). */
async function fetchYahooInstitutional(
  symbol: string
): Promise<OwnershipData["institutional"] | null> {
  try {
    const r: any = await yahooFinance.quoteSummary(
      symbol,
      { modules: ["majorHoldersBreakdown", "institutionOwnership"] },
      { validateResult: false }
    );
    const mh = r?.majorHoldersBreakdown;
    const list: any[] = r?.institutionOwnership?.ownershipList ?? [];
    const pct = (v: any) => (typeof v === "number" ? v * 100 : null);

    const topHolders: TopHolder[] = list.slice(0, 10).map((h) => ({
      name: h.organization ?? "Unknown",
      shares: h.position ?? null,
      pctHeld: pct(h.pctHeld),
      change: pct(h.pctChange),
    }));

    const hasAny =
      mh?.institutionsPercentHeld != null || topHolders.length > 0;
    if (!hasAny) return null;

    return {
      available: true,
      percentHeld: pct(mh?.institutionsPercentHeld),
      insiderPercentHeld: pct(mh?.insidersPercentHeld),
      count: mh?.institutionsCount ?? null,
      topHolders,
      source: "yahoo",
    };
  } catch {
    return null;
  }
}

/** Aggregate all ownership + insider data for a ticker. */
export async function getOwnership(symbol: string): Promise<OwnershipData> {
  const sym = symbol.toUpperCase();

  const [txns, sentiment, finnhubInst] = await Promise.all([
    fetchInsiderTransactions(sym).catch(() => []),
    fetchInsiderSentiment(sym).catch(
      () =>
        ({
          available: false,
          netShares: 0,
          avgMspr: null,
          label: "Neutral",
          months: [],
        }) as OwnershipData["sentiment"]
    ),
    fetchFinnhubInstitutional(sym),
  ]);

  // Institutional: Finnhub (premium) first, else Yahoo fallback.
  let institutional: OwnershipData["institutional"];
  if (finnhubInst) {
    institutional = {
      available: true,
      percentHeld: null,
      insiderPercentHeld: null,
      count: finnhubInst.topHolders.length,
      topHolders: finnhubInst.topHolders,
      source: "finnhub",
    };
  } else {
    institutional = (await fetchYahooInstitutional(sym)) ?? {
      available: false,
      percentHeld: null,
      insiderPercentHeld: null,
      count: null,
      topHolders: [],
      source: null,
    };
  }

  return { symbol: sym, institutional, insiderTransactions: txns, sentiment };
}
