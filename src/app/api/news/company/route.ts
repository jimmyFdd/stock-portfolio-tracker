import { NextRequest, NextResponse } from "next/server";
import { getCompanyNews, ProviderError } from "@/lib/provider";
import type { NewsArticle } from "@/lib/types";

export const runtime = "nodejs";

// GET /api/news/company?symbols=AAPL,MSFT
// Micro news: strictly company-specific headlines for the portfolio tickers.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("symbols") ?? "";
  const symbols = raw
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 20);

  if (!symbols.length) {
    return NextResponse.json({ articles: [] });
  }

  try {
    const perSymbol = await Promise.allSettled(symbols.map((s) => getCompanyNews(s)));

    // Merge, de-duplicate by id, and sort newest-first.
    const seen = new Set<string>();
    const merged: NewsArticle[] = [];
    for (const result of perSymbol) {
      if (result.status !== "fulfilled") continue;
      for (const a of result.value) {
        if (seen.has(a.id)) continue;
        seen.add(a.id);
        merged.push(a);
      }
    }
    merged.sort((a, b) => b.datetime - a.datetime);

    return NextResponse.json({ articles: merged.slice(0, 40) });
  } catch (err) {
    const status = err instanceof ProviderError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status });
  }
}
