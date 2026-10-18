"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { ChipTier } from "@/lib/types";

/** Smart money (big holders) vs retail/speculators, with the per-tier breakdown. */
export default function TierDistributionChart({
  bigHolderPct,
  retailHolderPct,
  tiers,
}: {
  bigHolderPct: number | null;
  retailHolderPct: number | null;
  tiers: ChipTier[];
}) {
  const big = bigHolderPct ?? 0;
  const retail = retailHolderPct ?? 0;
  const data = [
    { name: "Smart money / big holders", value: Number(big.toFixed(2)), fill: "#22c55e" },
    { name: "Retail / speculators", value: Number(retail.toFixed(2)), fill: "#f59e0b" },
  ].filter((d) => d.value > 0);

  if (data.length === 0) {
    return <p className="py-6 text-center text-xs text-slate-500">No tier data available.</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="h-40 w-40 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                paddingAngle={2}
                stroke="none"
              >
                {data.map((d, i) => (
                  <Cell key={i} fill={d.fill} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "#161d2e",
                  border: "1px solid #252d42",
                  borderRadius: 8,
                  color: "#fff",
                }}
                formatter={(v: number, n: string) => [`${v.toFixed(2)}%`, n]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-gain" />
            <span className="text-slate-300">Smart money</span>
            <span className="font-semibold text-white tabular-nums">{big.toFixed(1)}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-amber-500" />
            <span className="text-slate-300">Retail</span>
            <span className="font-semibold text-white tabular-nums">{retail.toFixed(1)}%</span>
          </div>
        </div>
      </div>

      {/* Per-tier (bracket) breakdown as a stacked bar */}
      {tiers.length > 2 && (
        <div className="mt-3">
          <div className="flex h-3 w-full overflow-hidden rounded-full">
            {tiers.map((t, i) => (
              <div
                key={i}
                title={`${t.label}: ${t.pct.toFixed(2)}%`}
                style={{ width: `${t.pct}%` }}
                className={t.group === "big" ? "bg-gain/80" : "bg-amber-500/70"}
              />
            ))}
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            {tiers.length} share-size brackets · green = big tier, amber = retail tier
          </p>
        </div>
      )}
    </div>
  );
}
