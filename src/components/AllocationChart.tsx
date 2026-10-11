"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import type { PositionMetrics } from "@/hooks/usePortfolioMetrics";
import { usd, pct } from "@/lib/format";

const COLORS = [
  "#6366f1",
  "#22c55e",
  "#f59e0b",
  "#ec4899",
  "#06b6d4",
  "#a855f7",
  "#ef4444",
  "#84cc16",
  "#3b82f6",
  "#f97316",
];

export default function AllocationChart({ positions }: { positions: PositionMetrics[] }) {
  const total = positions.reduce((s, p) => s + p.marketValue, 0);
  const data = positions
    .filter((p) => p.marketValue > 0)
    .map((p) => ({ name: p.symbol, value: Number(p.marketValue.toFixed(2)) }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Allocation
      </h2>
      {data.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-sm text-slate-500">
          Add positions to see allocation.
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
                stroke="none"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#161d2e",
                  border: "1px solid #252d42",
                  borderRadius: 8,
                  color: "#fff",
                }}
                formatter={(value: number, name: string) => [
                  `${usd(value)} (${pct(total ? (value / total) * 100 : 0)})`,
                  name,
                ]}
              />
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(v) => <span className="text-xs text-slate-300">{v}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
