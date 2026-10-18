"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ChipHistoryPoint } from "@/lib/types";
import { compactUsd } from "@/lib/format";

/**
 * Price vs big-holder % over the stored reporting periods — rising big-holder %
 * against price reveals accumulation; falling reveals distribution.
 *
 * Chip history accrues one point per day the snapshot is generated, so a full
 * 12–24 period trend builds over time rather than appearing on day one.
 */
export default function AccumulationTrendChart({
  symbol,
  history,
}: {
  symbol: string;
  history: ChipHistoryPoint[];
}) {
  const [priceByDate, setPriceByDate] = useState<Record<string, number>>({});

  // Overlay the real price series (reuse /api/history for this single symbol).
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/history", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdings: [{ symbol, shares: 1 }], days: 180 }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : { history: [] }))
      .then((d) => {
        const map: Record<string, number> = {};
        for (const p of d.history ?? []) map[p.date] = p.value;
        setPriceByDate(map);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [symbol]);

  const data = history.map((h) => ({
    date: h.date,
    bigHolderPct: h.bigHolderPct,
    price: priceByDate[h.date] ?? null,
  }));

  if (history.length < 2) {
    return (
      <p className="rounded-lg border border-dashed border-surface-border bg-surface px-3 py-4 text-xs text-slate-500">
        The accumulation trend needs at least two reporting periods. Only{" "}
        {history.length === 1 ? "one snapshot exists" : "no snapshots exist"} so far — it builds as
        new daily snapshots accrue (or as historical filings are added).
      </p>
    );
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="bigFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22c55e" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#252d42" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: "#64748b", fontSize: 11 }}
            tickFormatter={(d: string) => d.slice(5)}
            minTickGap={28}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="pct"
            tick={{ fill: "#22c55e", fontSize: 11 }}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            width={40}
            axisLine={false}
            tickLine={false}
            domain={["auto", "auto"]}
          />
          <YAxis
            yAxisId="price"
            orientation="right"
            tick={{ fill: "#6366f1", fontSize: 11 }}
            tickFormatter={(v: number) => compactUsd(v)}
            width={52}
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
            formatter={(v: number, n: string) =>
              n === "bigHolderPct" ? [`${v?.toFixed?.(1)}%`, "Big holders"] : [compactUsd(v), "Price"]
            }
          />
          <Area
            yAxisId="pct"
            type="monotone"
            dataKey="bigHolderPct"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#bigFill)"
          />
          <Line
            yAxisId="price"
            type="monotone"
            dataKey="price"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
