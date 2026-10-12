"use client";

import { useEffect, useState } from "react";
import type { OwnershipData } from "@/lib/types";
import { usd } from "@/lib/format";

const compactNum = (n: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    Number.isFinite(n) ? n : 0
  );

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-surface-border bg-surface px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

export default function OwnershipPanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<OwnershipData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/ownership/${encodeURIComponent(symbol)}`, { signal: ctrl.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || "Failed to load ownership");
        setData(d);
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [symbol]);

  if (loading) return <p className="px-4 py-5 text-sm text-slate-500">Loading ownership data…</p>;
  if (error) return <p className="px-4 py-5 text-sm text-loss">{error}</p>;
  if (!data) return null;

  const { institutional: inst, insiderTransactions: txns, sentiment: s } = data;

  const sentTone =
    s.label === "Net Buying"
      ? "border-gain/40 bg-gain/10 text-gain"
      : s.label === "Net Selling"
        ? "border-loss/40 bg-loss/10 text-loss"
        : "border-surface-border bg-surface text-slate-300";

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {/* Summary: insider sentiment */}
      <div className={`rounded-lg border px-3 py-2.5 ${sentTone}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold">Insider sentiment · last 6mo: {s.label}</span>
          {s.available && s.avgMspr != null && (
            <span className="text-xs opacity-90">
              MSPR {s.avgMspr >= 0 ? "+" : ""}
              {s.avgMspr.toFixed(1)}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs opacity-80">
          {s.available
            ? `Net ${s.netShares >= 0 ? "+" : ""}${compactNum(s.netShares)} shares across ${s.months.length} months`
            : "No insider-sentiment data available."}
        </p>
      </div>

      {/* Institutional holdings */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Institutional holdings
        </h4>
        {inst.available ? (
          <>
            <div className="mb-2 grid grid-cols-3 gap-2">
              <Stat
                label="Institutions"
                value={inst.percentHeld != null ? `${inst.percentHeld.toFixed(1)}%` : "—"}
              />
              <Stat
                label="Insiders"
                value={
                  inst.insiderPercentHeld != null ? `${inst.insiderPercentHeld.toFixed(1)}%` : "—"
                }
              />
              <Stat label="Holders" value={inst.count != null ? String(inst.count) : "—"} />
            </div>
            {inst.topHolders.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-surface-border">
                <table className="w-full min-w-[420px] text-xs">
                  <thead>
                    <tr className="border-b border-surface-border text-left text-slate-500">
                      <th className="px-3 py-2 font-medium">Holder</th>
                      <th className="px-3 py-2 text-right font-medium">Shares</th>
                      <th className="px-3 py-2 text-right font-medium">% held</th>
                      <th className="px-3 py-2 text-right font-medium">Δ pos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inst.topHolders.map((h, i) => (
                      <tr key={i} className="border-b border-surface-border/60 last:border-0">
                        <td className="px-3 py-2 text-slate-200">{h.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                          {h.shares != null ? compactNum(h.shares) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-300">
                          {h.pctHeld != null ? `${h.pctHeld.toFixed(2)}%` : "—"}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            h.change == null
                              ? "text-slate-500"
                              : h.change >= 0
                                ? "text-gain"
                                : "text-loss"
                          }`}
                        >
                          {h.change != null
                            ? `${h.change >= 0 ? "+" : ""}${h.change.toFixed(1)}%`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-1 text-[10px] text-slate-600">Source: {inst.source}</p>
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-surface-border bg-surface px-3 py-3 text-xs text-slate-500">
            Institutional ownership data is unavailable for this ticker (Finnhub institutional
            data is a premium endpoint, and the Yahoo fallback is rate-limited or has no coverage).
          </p>
        )}
      </div>

      {/* Insider activity feed */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Recent insider activity
        </h4>
        {txns.length === 0 ? (
          <p className="rounded-lg border border-dashed border-surface-border bg-surface px-3 py-3 text-xs text-slate-500">
            No recent insider transactions (US SEC filings only).
          </p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1">
            {txns.map((t, i) => {
              const tone =
                t.type === "buy"
                  ? "text-gain bg-gain/10"
                  : t.type === "sell"
                    ? "text-loss bg-loss/10"
                    : "text-slate-400 bg-slate-700/20";
              return (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg border border-surface-border bg-surface px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-white">{t.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {t.date}
                      {t.code ? ` · ${t.code}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <span className="tabular-nums text-slate-300">
                      {compactNum(t.shares)}
                      {t.price > 0 ? ` @ ${usd(t.price)}` : ""}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 font-semibold uppercase ${tone}`}>
                      {t.type === "buy" ? "Buy" : t.type === "sell" ? "Sell" : t.code || "—"}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
