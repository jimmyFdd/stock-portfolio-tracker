"use client";

import { ReactNode } from "react";
import { usePortfolio } from "./PortfolioProvider";
import { useLivePrices } from "@/hooks/useLivePrices";
import { usePortfolioMetrics } from "@/hooks/usePortfolioMetrics";
import AddStockForm from "./AddStockForm";
import PortfolioSummary from "./PortfolioSummary";
import HoldingsTable from "./HoldingsTable";
import AllocationChart from "./AllocationChart";
import PerformanceChart from "./PerformanceChart";
import NewsFeed from "./NewsFeed";
import { relativeTime } from "@/lib/format";

// `directory` is a server-rendered component (the social directory) passed in
// from the server page, so it can query the DB without a client round-trip.
export default function Dashboard({ directory }: { directory?: ReactNode }) {
  const { holdings, symbols, hydrated, error: portfolioError } = usePortfolio();
  const { quotes, lastUpdated, loading, error, refresh } = useLivePrices(symbols);
  const metrics = usePortfolioMetrics(holdings, quotes);

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Portfolio Tracker</h1>
          <p className="text-sm text-slate-400">
            Live prices, P&amp;L, allocation, and micro/macro news.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${
                error ? "bg-loss" : loading ? "bg-amber-400 animate-pulse" : "bg-gain"
              }`}
            />
            {error ? "Error" : loading ? "Updating" : "Live"}
          </span>
          {lastUpdated && <span>Updated {relativeTime(lastUpdated / 1000)}</span>}
          <button
            onClick={refresh}
            className="rounded-md border border-surface-border px-2.5 py-1 font-medium text-slate-300 transition-colors hover:border-brand hover:text-white"
          >
            Refresh
          </button>
        </div>
      </header>

      {(error || portfolioError) && (
        <div className="mb-4 rounded-lg border border-loss/40 bg-loss/10 px-4 py-2 text-sm text-loss">
          {portfolioError || error}
        </div>
      )}

      <div className="mb-6">
        <PortfolioSummary metrics={metrics} />
      </div>

      <div className="mb-6">
        <AddStockForm />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PerformanceChart holdings={holdings} />
        </div>
        <AllocationChart positions={metrics.positions} />
      </div>

      <div className="mb-6">
        <HoldingsTable positions={metrics.positions} />
      </div>

      <div className="mb-10 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="lg:col-span-2">
          <NewsFeed symbols={symbols} />
        </section>
        {directory && <aside>{directory}</aside>}
      </div>

      {!hydrated && (
        <p className="text-center text-xs text-slate-600">Loading your portfolio…</p>
      )}
    </main>
  );
}
