"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Holding, HistoryPoint } from "@/lib/types";
import { compactUsd, usd } from "@/lib/format";

const RANGES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
];

export default function PerformanceChart({ holdings }: { holdings: Holding[] }) {
  const [days, setDays] = useState(90);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Serialize holdings to a stable key so we only refetch on real changes.
  const key = useMemo(
    () => holdings.map((h) => `${h.symbol}:${h.shares}`).sort().join("|"),
    [holdings]
  );

  useEffect(() => {
    if (!holdings.length) {
      setHistory([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        holdings: holdings.map((h) => ({ symbol: h.symbol, shares: h.shares })),
        days,
      }),
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load history");
        setHistory(data.history ?? []);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, days]);

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
          Performance
        </h2>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setDays(r.days)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                days === r.days
                  ? "bg-brand text-white"
                  : "text-slate-400 hover:bg-surface hover:text-white"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {holdings.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-slate-500">
          Add positions to see historical performance.
        </div>
      ) : (
        <div className="h-64">
          {error && <p className="mb-2 text-xs text-loss">{error}</p>}
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="perfFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#252d42" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(5)}
                minTickGap={32}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "#64748b", fontSize: 11 }}
                tickFormatter={(v: number) => compactUsd(v)}
                width={56}
                axisLine={false}
                tickLine={false}
                domain={["auto", "auto"]}
              />
              <Tooltip
                contentStyle={{
                  background: "#161d2e",
                  border: "1px solid #252d42",
                  borderRadius: 8,
                  color: "#fff",
                }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(value: number) => [usd(value), "Value"]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#perfFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
          {loading && <p className="mt-1 text-xs text-slate-500">Updating…</p>}
        </div>
      )}
    </div>
  );
}
