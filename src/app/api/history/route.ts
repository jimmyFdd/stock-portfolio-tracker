import { NextRequest, NextResponse } from "next/server";
import { getPortfolioHistory, ProviderError } from "@/lib/provider";

export const runtime = "nodejs";

// POST /api/history
// Body: { holdings: [{ symbol, shares }], days?: number }
// Returns an aggregated portfolio value time series for the performance chart.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const holdings = Array.isArray(body?.holdings) ? body.holdings : [];
    const days = Math.min(Math.max(Number(body?.days) || 90, 7), 365);

    const clean = holdings
      .map((h: any) => ({ symbol: String(h.symbol ?? "").toUpperCase(), shares: Number(h.shares) }))
      .filter((h: any) => h.symbol && Number.isFinite(h.shares) && h.shares > 0)
      .slice(0, 30);

    const history = await getPortfolioHistory(clean, days);
    return NextResponse.json({ history });
  } catch (err) {
    const status = err instanceof ProviderError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status });
  }
}
