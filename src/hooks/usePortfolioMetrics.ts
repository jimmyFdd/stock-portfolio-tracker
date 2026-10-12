"use client";

import { useMemo } from "react";
import type { Holding, Quote } from "@/lib/types";

export interface PositionMetrics extends Holding {
  currency: string; // native trading currency, e.g. "JPY"
  usdRate: number; // native → USD multiplier
  nativePrice: number; // current price in the native currency
  price: number; // current price in USD
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
      const usdRate = q?.usdRate ?? 1; // native → USD (1 for USD / until a quote lands)
      const currency = q?.currency ?? "USD";

      // The buy price is stored in the ticker's native currency, so both it and
      // the live price are converted with the same rate before any math.
      const nativePrice = q?.current ?? h.buyPrice; // fall back to cost until a quote lands
      const price = nativePrice * usdRate; // USD
      const avgCostUsd = h.buyPrice * usdRate; // USD

      const marketValue = price * h.shares;
      const costBasis = avgCostUsd * h.shares;
      const gain = marketValue - costBasis;

      const prevCloseUsd = (q?.previousClose ?? nativePrice) * usdRate;
      const dayChange = (price - prevCloseUsd) * h.shares;

      return {
        ...h,
        currency,
        usdRate,
        nativePrice,
        price,
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
