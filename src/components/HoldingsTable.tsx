"use client";

import { usePortfolio } from "./PortfolioProvider";
import type { PositionMetrics } from "@/hooks/usePortfolioMetrics";
import { usd, pct, signedUsd, nativeMoney } from "@/lib/format";

function ChangeCell({ amount, percent }: { amount: string; percent: string }) {
  return (
    <div className="flex flex-col items-end">
      <span>{amount}</span>
      <span className="text-xs opacity-80">{percent}</span>
    </div>
  );
}

export default function HoldingsTable({ positions }: { positions: PositionMetrics[] }) {
  const { removeHolding } = usePortfolio();

  if (positions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-border bg-surface-card p-10 text-center">
        <p className="text-slate-300">No positions yet.</p>
        <p className="mt-1 text-sm text-slate-500">
          Add your first stock above to start tracking your portfolio.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-border bg-surface-card">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-3 font-medium">Symbol</th>
            <th className="px-4 py-3 text-right font-medium">Shares</th>
            <th className="px-4 py-3 text-right font-medium">Avg cost</th>
            <th className="px-4 py-3 text-right font-medium">Price</th>
            <th className="px-4 py-3 text-right font-medium">Today</th>
            <th className="px-4 py-3 text-right font-medium">Mkt value</th>
            <th className="px-4 py-3 text-right font-medium">Total P&L</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => {
            const gainTone = p.gain >= 0 ? "text-gain" : "text-loss";
            const dayTone = p.dayChange >= 0 ? "text-gain" : "text-loss";
            return (
              <tr
                key={p.id}
                className="border-b border-surface-border/60 last:border-0 hover:bg-surface/40"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    {p.symbol}
                    {p.currency !== "USD" && (
                      <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-normal text-brand">
                        {p.currency}
                      </span>
                    )}
                    {!p.hasQuote && (
                      <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-normal text-slate-300">
                        no quote
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-200">{p.shares}</td>
                <td className="px-4 py-3 text-right tabular-nums text-slate-200">
                  <div className="flex flex-col items-end">
                    <span>{usd(p.avgCostUsd)}</span>
                    {p.currency !== "USD" && (
                      <span className="text-[11px] text-slate-500">
                        {nativeMoney(p.buyPrice, p.currency)}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-white">
                  <div className="flex flex-col items-end">
                    <span>{usd(p.price)}</span>
                    {p.currency !== "USD" && (
                      <span className="text-[11px] text-slate-500">
                        {nativeMoney(p.nativePrice, p.currency)}
                      </span>
                    )}
                  </div>
                </td>
                <td className={`px-4 py-3 text-right tabular-nums ${dayTone}`}>
                  <ChangeCell amount={signedUsd(p.dayChange)} percent={pct(p.dayChangePct)} />
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-white">
                  {usd(p.marketValue)}
                </td>
                <td className={`px-4 py-3 text-right tabular-nums ${gainTone}`}>
                  <ChangeCell amount={signedUsd(p.gain)} percent={pct(p.gainPct)} />
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => removeHolding(p.id)}
                    aria-label={`Remove ${p.symbol}`}
                    className="rounded-md px-2 py-1 text-slate-500 transition-colors hover:bg-loss/10 hover:text-loss"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
