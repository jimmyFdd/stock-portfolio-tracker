"use client";

import { useMemo } from "react";
import type { Holding, Quote } from "@/lib/types";
import { inferCurrency, approxUsdRate } from "@/lib/currency";

export interface PositionMetrics extends Holding {
  currency: string; // native trading currency, e.g. "JPY"
  usdRate: number; // native → USD multiplier
  nativePrice: number; // effective price in the native currency (manual or live)
  price: number; // effective price in USD
  isManual: boolean; // true when a manual price override is in effect
  avgCostUsd: number; // buy price per share in USD
  marketValue: number; // USD
  costBasis: number; // USD
  gain: number; // USD
  gainPct: number;
  dayChange: number; // USD
  dayChangePct: number;
  hasQuote: boolean;
}

export interface PortfolioMetrics {
  positions: PositionMetrics[];
  totalValue: number;
  totalCost: number;
  totalGain: number;
  totalGainPct: number;
  totalDayChange: number;
  totalDayChangePct: number;
}

/** Combines holdings with live quotes into per-position and portfolio totals. */
export function usePortfolioMetrics(
  holdings: Holding[],
  quotes: Record<string, Quote>
): PortfolioMetrics {
  return useMemo(() => {
    const positions: PositionMetrics[] = holdings.map((h) => {
      const q = quotes[h.symbol];
      // When a live quote is missing, infer the currency from the ticker suffix
      // and use an approximate rate so foreign holdings aren't shown 1:1 as USD.
      const currency = q?.currency ?? inferCurrency(h.symbol);
      const usdRate = q?.usdRate ?? approxUsdRate(currency); // native → USD

      // A manual override (stored in native currency) wins over the live quote;
      // it's the effective price for all downstream math. Both it and the buy
      // price are converted with the same FX rate.
      const isManual = h.manualPrice != null;
      const nativePrice = h.manualPrice ?? q?.current ?? h.buyPrice;
      const price = nativePrice * usdRate; // USD
      const avgCostUsd = h.buyPrice * usdRate; // USD

      const marketValue = price * h.shares;
      const costBasis = avgCostUsd * h.shares;
      const gain = marketValue - costBasis;

      // Today's change uses the live previous close; with a manual price and no
      // live quote there's no reference, so it naturally resolves to zero.
      const prevCloseUsd = (q?.previousClose ?? nativePrice) * usdRate;
      const dayChange = (price - prevCloseUsd) * h.shares;

      return {
        ...h,
        currency,
        usdRate,
        nativePrice,
        price,
        isManual,
        avgCostUsd,
        marketValue,
        costBasis,
        gain,
        gainPct: costBasis ? (gain / costBasis) * 100 : 0,
        dayChange,
        dayChangePct: prevCloseUsd ? ((price - prevCloseUsd) / prevCloseUsd) * 100 : 0,
        hasQuote: Boolean(q),
      };
    });

    const totalValue = positions.reduce((s, p) => s + p.marketValue, 0);
    const totalCost = positions.reduce((s, p) => s + p.costBasis, 0);
    const totalGain = totalValue - totalCost;
    const totalDayChange = positions.reduce((s, p) => s + p.dayChange, 0);
    const prevTotal = totalValue - totalDayChange;

    return {
      positions,
      totalValue,
      totalCost,
      totalGain,
      totalGainPct: totalCost ? (totalGain / totalCost) * 100 : 0,
      totalDayChange,
      totalDayChangePct: prevTotal ? (totalDayChange / prevTotal) * 100 : 0,
    };
  }, [holdings, quotes]);
}
