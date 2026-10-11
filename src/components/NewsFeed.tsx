"use client";

import { useEffect, useMemo, useState } from "react";
import type { NewsArticle } from "@/lib/types";
import { relativeTime } from "@/lib/format";

type Tab = "micro" | "macro";

function ArticleCard({ article }: { article: NewsArticle }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 rounded-lg border border-surface-border bg-surface p-3 transition-colors hover:border-brand/60"
    >
      {article.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.image}
          alt=""
          className="hidden h-16 w-16 flex-shrink-0 rounded-md object-cover sm:block"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      ) : null}
      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-medium text-white">{article.headline}</p>
        <p className="mt-1 line-clamp-2 text-xs text-slate-400">{article.summary}</p>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
          <span className="font-medium text-slate-400">{article.source}</span>
          <span>•</span>
          <span>{relativeTime(article.datetime)}</span>
          {article.related && (
            <>
              <span>•</span>
              <span className="rounded bg-brand/15 px-1.5 py-0.5 text-brand">
                {article.related.split(",")[0]}
              </span>
            </>
          )}
        </div>
      </div>
    </a>
  );
}

export default function NewsFeed({ symbols }: { symbols: string[] }) {
  const [tab, setTab] = useState<Tab>("micro");
  const [micro, setMicro] = useState<NewsArticle[]>([]);
  const [macro, setMacro] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const symbolsKey = useMemo(() => [...symbols].sort().join(","), [symbols]);

  // Micro (company) news — refetch whenever the portfolio's tickers change.
  useEffect(() => {
    if (tab !== "micro") return;
    if (!symbolsKey) {
      setMicro([]);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/news/company?symbols=${encodeURIComponent(symbolsKey)}`, { signal: ctrl.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load news");
        setMicro(data.articles ?? []);
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [tab, symbolsKey]);

  // Macro (market-wide) news — independent of the portfolio.
  useEffect(() => {
    if (tab !== "macro" || macro.length) return;
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    fetch(`/api/news/market`, { signal: ctrl.signal })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Failed to load news");
        setMacro(data.articles ?? []);
      })
      .catch((e) => e.name !== "AbortError" && setError(e.message))
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [tab, macro.length]);

  const articles = tab === "micro" ? micro : macro;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <button
          onClick={() => setTab("micro")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "micro" ? "bg-brand text-white" : "text-slate-400 hover:text-white"
          }`}
        >
          Micro · My tickers
        </button>
        <button
          onClick={() => setTab("macro")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            tab === "macro" ? "bg-brand text-white" : "text-slate-400 hover:text-white"
          }`}
        >
          Macro · Markets
        </button>
      </div>

      <p className="mb-3 text-xs text-slate-500">
        {tab === "micro"
          ? "Company-specific headlines filtered to the tickers you hold."
          : "Market-wide economy, Federal Reserve, and sector trends."}
      </p>

      {error && <p className="mb-2 text-xs text-loss">{error}</p>}

      {loading && articles.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading news…</p>
      ) : articles.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          {tab === "micro"
            ? "No portfolio tickers yet — add a position to see company news."
            : "No market news available right now."}
        </p>
      ) : (
        <div className="flex max-h-[520px] flex-col gap-2 overflow-y-auto pr-1">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      )}
    </div>
  );
}
