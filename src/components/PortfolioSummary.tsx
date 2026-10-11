"use client";

import type { PortfolioMetrics } from "@/hooks/usePortfolioMetrics";
import { usd, pct, signedUsd } from "@/lib/format";

function Stat({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "neutral" | "gain" | "loss";
}) {
  const toneClass =
    tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : "text-white";
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
      {sub && <p className={`mt-0.5 text-sm ${toneClass}`}>{sub}</p>}
    </div>
  );
}

export default function PortfolioSummary({ metrics }: { metrics: PortfolioMetrics }) {
  const gainTone = metrics.totalGain >= 0 ? "gain" : "loss";
  const dayTone = metrics.totalDayChange >= 0 ? "gain" : "loss";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Total value" value={usd(metrics.totalValue)} />
      <Stat label="Cost basis" value={usd(metrics.totalCost)} />
      <Stat
        label="Total P&L"
        value={signedUsd(metrics.totalGain)}
        sub={pct(metrics.totalGainPct)}
        tone={gainTone}
      />
      <Stat
        label="Today"
        value={signedUsd(metrics.totalDayChange)}
        sub={pct(metrics.totalDayChangePct)}
        tone={dayTone}
      />
    </div>
  );
}
