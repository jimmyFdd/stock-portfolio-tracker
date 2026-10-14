"use client";

import { useEffect, useState } from "react";
import type { DailyAnalysis } from "@/lib/types";
import { pct } from "@/lib/format";

function DriverBadge({ driver }: { driver: DailyAnalysis["driver"] }) {
  const label =
    driver === "Both" ? "Macro + Micro" : driver === "Macro" ? "Macro Driven" : "Micro Driven";
  const tone =
    driver === "Macro"
      ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
      : driver === "Micro"
        ? "border-brand/40 bg-brand/10 text-brand"
        : "border-violet-500/40 bg-violet-500/10 text-violet-300";
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

function TrajectoryBadge({ t }: { t: DailyAnalysis["trajectoryType"] }) {
  const structural = t === "Structural Shift";
  const label = structural ? "Structural Shift" : "Transitory Volatility";
  const tone = structural
    ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
    : "border-slate-500/40 bg-slate-500/10 text-slate-300";
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

export default function AnalysisCard({ symbol }: { symbol: string }) {
  const [data, setData] = useState<DailyAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (refresh = false) => {
    const ctrl = new AbortController();
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    fetch(`/api/analysis/${encodeURIComponent(symbol)}${refresh ? "?refresh=1" : ""}`, {
      signal: ctrl.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || "Failed to load analysis");
        setData(d);
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
    return () => ctrl.abort();
  };

  useEffect(() => {
    const cancel = load(false);
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  return (
    <div className="rounded-lg border border-surface-border bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          AI Movement Analysis
        </h4>
        <button
          onClick={() => load(true)}
          disabled={loading || refreshing}
          className="rounded-md border border-surface-border px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-brand hover:text-white disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh Analysis"}
        </button>
      </div>

      {loading ? (
        <p className="py-3 text-sm text-slate-500">Analyzing today&apos;s move…</p>
      ) : error ? (
        <p className="py-2 text-xs text-loss">{error}</p>
      ) : data ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <DriverBadge driver={data.driver} />
            <TrajectoryBadge t={data.trajectoryType} />
            {data.priceChangePct != null && (
              <span
                className={`text-xs tabular-nums ${
                  data.priceChangePct >= 0 ? "text-gain" : "text-loss"
                }`}
              >
                {pct(data.priceChangePct)} today
              </span>
            )}
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Today&apos;s cause</p>
            <p className="text-sm text-slate-200">{data.summary}</p>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Long-term impact
            </p>
            <p className="text-sm text-slate-200">{data.longTermOutlook}</p>
          </div>

          <p className="text-[10px] text-slate-600">
            {data.cached ? "Cached for today" : "Freshly generated"} · {data.date}
          </p>
        </div>
      ) : null}
    </div>
  );
}
