// Public, read-only profile: a specific user's portfolio, total value, and the
// micro (company-specific) news for the tickers they hold. Server-rendered so
// live quotes and news are fetched securely with the server-side provider.

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getQuote, getCompanyNews } from "@/lib/provider";
import type { NewsArticle, Quote } from "@/lib/types";
import { usd, pct, signedUsd, relativeTime } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: { userId: string } }) {
  // The dynamic segment is `[userId]`, but accept either a database id or a
  // username so links are forgiving regardless of which one is used. Both are
  // unique, so findUnique works for each.
  const include = { positions: { orderBy: { createdAt: "asc" as const } } };
  const user =
    (await prisma.user.findUnique({ where: { id: params.userId }, include })) ??
    (await prisma.user.findUnique({ where: { username: params.userId }, include }));

  if (!user) notFound();

  const symbols = user.positions.map((p) => p.symbol);

  // Live quotes (best-effort — a failed symbol just falls back to cost basis).
  const quoteResults = await Promise.allSettled(symbols.map((s) => getQuote(s)));
  const quotes: Record<string, Quote> = {};
  quoteResults.forEach((r, i) => {
    if (r.status === "fulfilled") quotes[symbols[i]] = r.value;
  });

  // Per-position + total metrics.
  const positions = user.positions.map((p) => {
    const price = quotes[p.symbol]?.current ?? p.buyPrice;
    const marketValue = price * p.shares;
    const costBasis = p.buyPrice * p.shares;
    const gain = marketValue - costBasis;
    return {
      ...p,
      price,
      marketValue,
      costBasis,
      gain,
      gainPct: costBasis ? (gain / costBasis) * 100 : 0,
      hasQuote: Boolean(quotes[p.symbol]),
    };
  });
  const totalValue = positions.reduce((s, p) => s + p.marketValue, 0);
  const totalCost = positions.reduce((s, p) => s + p.costBasis, 0);
  const totalGain = totalValue - totalCost;
  const totalGainPct = totalCost ? (totalGain / totalCost) * 100 : 0;

  // Micro news: merge per-ticker company news, de-dupe, newest first.
  let news: NewsArticle[] = [];
  if (symbols.length) {
    const newsResults = await Promise.allSettled(symbols.map((s) => getCompanyNews(s)));
    const seen = new Set<string>();
    for (const r of newsResults) {
      if (r.status !== "fulfilled") continue;
      for (const a of r.value) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        news.push(a);
      }
    }
    news.sort((a, b) => b.datetime - a.datetime);
    news = news.slice(0, 15);
  }

  const gainTone = totalGain >= 0 ? "text-gain" : "text-loss";

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:py-10">
      <Link href="/" className="mb-4 inline-block text-sm text-slate-400 hover:text-white">
        ← Back to dashboard
      </Link>

      {/* Profile header */}
      <div className="mb-6 flex items-center gap-4 rounded-xl border border-surface-border bg-surface-card p-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {user.imageUrl ? (
          <img src={user.imageUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <span className="grid h-16 w-16 place-items-center rounded-full bg-brand/20 text-2xl font-semibold text-brand">
            {user.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">{user.name}</h1>
          <p className="text-sm text-slate-400">@{user.username}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs uppercase tracking-wide text-slate-400">Portfolio value</p>
          <p className="text-2xl font-semibold text-white">{usd(totalValue)}</p>
          <p className={`text-sm ${gainTone}`}>
            {signedUsd(totalGain)} ({pct(totalGainPct)})
          </p>
        </div>
      </div>

      {/* Holdings (read-only) */}
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        Holdings
      </h2>
      {positions.length === 0 ? (
        <div className="mb-8 rounded-xl border border-dashed border-surface-border bg-surface-card p-8 text-center text-sm text-slate-500">
          This investor hasn&apos;t added any positions yet.
        </div>
      ) : (
        <div className="mb-8 overflow-x-auto rounded-xl border border-surface-border bg-surface-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-surface-border text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3 font-medium">Symbol</th>
                <th className="px-4 py-3 text-right font-medium">Shares</th>
                <th className="px-4 py-3 text-right font-medium">Price</th>
                <th className="px-4 py-3 text-right font-medium">Mkt value</th>
                <th className="px-4 py-3 text-right font-medium">P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id} className="border-b border-surface-border/60 last:border-0">
                  <td className="px-4 py-3 font-semibold text-white">{p.symbol}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-200">{p.shares}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-white">{usd(p.price)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-white">
                    {usd(p.marketValue)}
                  </td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${
                      p.gain >= 0 ? "text-gain" : "text-loss"
                    }`}
                  >
                    {signedUsd(p.gain)} ({pct(p.gainPct)})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Micro news for this user's tickers */}
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
        News for {user.name.split(" ")[0]}&apos;s tickers
      </h2>
      {news.length === 0 ? (
        <p className="rounded-xl border border-surface-border bg-surface-card p-6 text-center text-sm text-slate-500">
          No recent company news for these holdings.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {news.map((a) => (
            <a
              key={a.id}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 rounded-lg border border-surface-border bg-surface-card p-3 transition-colors hover:border-brand/60"
            >
              <div className="min-w-0">
                <p className="line-clamp-2 text-sm font-medium text-white">{a.headline}</p>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="font-medium text-slate-400">{a.source}</span>
                  <span>•</span>
                  <span>{relativeTime(a.datetime)}</span>
                  {a.related && (
                    <>
                      <span>•</span>
                      <span className="rounded bg-brand/15 px-1.5 py-0.5 text-brand">
                        {a.related.split(",")[0]}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
