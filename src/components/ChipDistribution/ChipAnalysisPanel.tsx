"use client";

import { useEffect, useState } from "react";
import type { ChipDistribution } from "@/lib/types";
import TierDistributionChart from "./TierDistributionChart";
import AccumulationTrendChart from "./AccumulationTrendChart";
import FlowSentimentChart from "./FlowSentimentChart";

function StanceBadge({ stance }: { stance: NonNullable<ChipDistribution["ai"]>["stance"] }) {
  const tone =
    stance === "Accumulating"
      ? "border-gain/40 bg-gain/10 text-gain"
      : stance === "Distributing"
        ? "border-loss/40 bg-loss/10 text-loss"
        : "border-slate-500/40 bg-slate-500/10 text-slate-300";
  return (
    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${tone}`}>
      Smart money: {stance}
    </span>
  );
}

export default function ChipAnalysisPanel({ symbol }: { symbol: string }) {
  const [data, setData] = useState<ChipDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = (refresh = false) => {
    const ctrl = new AbortController();
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    fetch(`/api/chip-distribution/${encodeURIComponent(symbol)}${refresh ? "?refresh=1" : ""}`, {
      signal: ctrl.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d?.error || "Failed to load chip distribution");
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

  if (loading) return <p className="px-1 py-4 text-sm text-slate-500">Loading chip distribution…</p>;
  if (error) return <p className="px-1 py-4 text-sm text-loss">{error}</p>;
  if (!data) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="rounded bg-brand/15 px-1.5 py-0.5 text-[10px] font-medium text-brand">
          {data.market} market{data.reportDate ? ` · ${data.reportDate}` : ""}
        </span>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="rounded-md border border-surface-border px-2 py-1 text-[11px] font-medium text-slate-300 transition-colors hover:border-brand hover:text-white disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {!data.available ? (
        <p className="rounded-lg border border-dashed border-surface-border bg-surface px-3 py-4 text-xs text-slate-500">
          No chip-distribution data is available for {symbol} from the free sources.
        </p>
      ) : (
        <>
          {/* AI interpretation card */}
          {data.ai && (
            <div className="rounded-lg border border-surface-border bg-surface p-3">
              <div className="mb-1 flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  AI chip interpretation
                </h4>
                <StanceBadge stance={data.ai.stance} />
              </div>
              <p className="text-sm text-slate-200">{data.ai.interpretation}</p>
            </div>
          )}

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Tier distribution — smart money vs retail
            </h4>
            <TierDistributionChart
              bigHolderPct={data.bigHolderPct}
              retailHolderPct={data.retailHolderPct}
              tiers={data.tiers}
            />
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Accumulation trend — price vs big-holder %
            </h4>
            <AccumulationTrendChart symbol={symbol} history={data.history} />
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Flow &amp; sentiment
            </h4>
            <FlowSentimentChart
              insiderNetShares={data.insiderNetShares}
              marginRatio={data.marginRatio}
              market={data.market}
            />
          </div>
        </>
      )}

      {/* Provenance / honesty */}
      {(data.sources.length > 0 || data.notes.length > 0) && (
        <div className="border-t border-surface-border pt-2 text-[10px] text-slate-600">
          {data.sources.length > 0 && <p>Sources: {data.sources.join(", ")}</p>}
          {data.notes.map((n, i) => (
            <p key={i}>· {n}</p>
          ))}
        </div>
      )}
    </div>
  );
}
