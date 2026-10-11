import { NextResponse } from "next/server";
import { getMarketNews, ProviderError } from "@/lib/provider";

export const runtime = "nodejs";

// GET /api/news/market
// Macro news: market-wide economy, Federal Reserve, and sector trends.
export async function GET() {
  try {
    const articles = await getMarketNews();
    return NextResponse.json({ articles });
  } catch (err) {
    const status = err instanceof ProviderError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status });
  }
}
