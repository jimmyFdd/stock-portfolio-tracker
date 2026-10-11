"use client";

import { useMemo } from "react";
import type { Holding, Quote } from "@/lib/types";

export interface PositionMetrics extends Holding {
  price: number;
  marketValue: number;
  costBasis: number;
  gain: number;
  gainPct: number;
  dayChange: number;
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
      const price = q?.current ?? h.buyPrice; // fall back to cost until a quote lands
      const marketValue = price * h.shares;
      const costBasis = h.buyPrice * h.shares;
      const gain = marketValue - costBasis;
      const prevClose = q?.previousClose ?? price;
      const dayChange = (price - prevClose) * h.shares;
      return {
        ...h,
        price,
        marketValue,
        costBasis,
        gain,
        gainPct: costBasis ? (gain / costBasis) * 100 : 0,
        dayChange,
        dayChangePct: prevClose ? ((price - prevClose) / prevClose) * 100 : 0,
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
