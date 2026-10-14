"use client";

import { useState } from "react";
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

/**
 * Interactive price cell. Click the price (or the pencil) to enter a manual
 * price in the ticker's native currency; a "Manual" badge marks overrides and
 * ↺ reverts to live quotes.
 */
function PriceCell({ p }: { p: PositionMetrics }) {
  const { updateHolding } = usePortfolio();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");

  const startEdit = () => {
    setVal(String(p.manualPrice ?? p.nativePrice ?? ""));
    setEditing(true);
  };
  const save = () => {
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) updateHolding(p.id, { manualPrice: n });
    setEditing(false);
  };
  const reset = () => {
    updateHolding(p.id, { manualPrice: null });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center justify-end gap-1">
        {p.currency !== "USD" && (
          <span className="text-[11px] text-slate-500" title="Enter the price in the native currency">
            {p.currency}
          </span>
        )}
        <input
          autoFocus
          type="number"
          min="0"
          step="any"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          className="w-24 rounded border border-surface-border bg-surface px-2 py-1 text-right text-sm text-white outline-none focus:border-brand"
        />
        <button
          onClick={save}
          aria-label="Save manual price"
          className="rounded px-1.5 py-1 text-gain hover:bg-gain/10"
        >
          ✓
        </button>
        <button
          onClick={() => setEditing(false)}
          aria-label="Cancel"
          className="rounded px-1.5 py-1 text-slate-400 hover:bg-surface"
        >
          ✕
        </button>
        {p.isManual && (
          <button
            onClick={reset}
            title="Reset to live quotes"
            aria-label="Reset to live quotes"
            className="rounded px-1.5 py-1 text-slate-400 hover:bg-surface"
          >
            ↺
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={startEdit}
      title="Click to set a manual price"
      className="group ml-auto flex flex-col items-end"
    >
      <span className="flex items-center gap-1.5 text-white">
        {usd(p.price)}
        {p.isManual && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-normal text-amber-400">
            Manual
          </span>
        )}
        <span className="text-slate-500 opacity-0 transition-opacity group-hover:opacity-100">✎</span>
      </span>
      {p.currency !== "USD" && (
        <span className="text-[11px] text-slate-500">{nativeMoney(p.nativePrice, p.currency)}</span>
      )}
    </button>
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
                    {!p.hasQuote && !p.isManual && (
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
                  <PriceCell p={p} />
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
