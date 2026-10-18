"use client";

import type { ChipMarket } from "@/lib/types";

const compactNum = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    Number.isFinite(n) ? n : 0
  );

/** Insider buy/sell flow + short-interest / margin dynamics as simple gauges. */
export default function FlowSentimentChart({
  insiderNetShares,
  marginRatio,
  market,
}: {
  insiderNetShares: number | null;
  marginRatio: number | null;
  market: ChipMarket;
}) {
  const marginLabel = market === "TW" ? "信用倍率 / margin" : "Short interest";

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {/* Insider net flow */}
      <div className="rounded-lg border border-surface-border bg-surface p-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">Insider net (6mo)</p>
        {insiderNetShares == null ? (
          <p className="mt-1 text-sm text-slate-500">Unavailable</p>
        ) : (
          <>
            <p
              className={`mt-1 text-lg font-semibold tabular-nums ${
                insiderNetShares >= 0 ? "text-gain" : "text-loss"
              }`}
            >
              {insiderNetShares >= 0 ? "+" : ""}
              {compactNum(insiderNetShares)}
            </p>
            <p className="text-xs text-slate-400">
              {insiderNetShares > 0 ? "Net buying" : insiderNetShares < 0 ? "Net selling" : "Flat"}
            </p>
          </>
        )}
      </div>

      {/* Short interest / margin */}
      <div className="rounded-lg border border-surface-border bg-surface p-3">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">{marginLabel}</p>
        {marginRatio == null ? (
          <p className="mt-1 text-sm text-slate-500">Unavailable</p>
        ) : (
          <>
            <p className="mt-1 text-lg font-semibold tabular-nums text-white">
              {marginRatio.toFixed(2)}
              {market === "TW" ? "" : "%"}
            </p>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface-border">
              <div
                className="h-full bg-brand"
                style={{ width: `${Math.min(100, market === "TW" ? marginRatio * 20 : marginRatio * 5)}%` }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
