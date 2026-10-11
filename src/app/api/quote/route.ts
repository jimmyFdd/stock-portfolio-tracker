import { NextRequest, NextResponse } from "next/server";
import { getQuote, ProviderError } from "@/lib/provider";

export const runtime = "nodejs";

// GET /api/quote?symbol=AAPL            -> single quote
// GET /api/quote?symbols=AAPL,MSFT,NVDA -> batch quotes
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const single = params.get("symbol");
  const batch = params.get("symbols");

  try {
    if (batch) {
      const symbols = batch
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, 30); // guard against runaway fan-out

      const results = await Promise.allSettled(symbols.map((s) => getQuote(s)));
      const quotes = results
        .filter((r): r is PromiseFulfilledResult<any> => r.status === "fulfilled")
        .map((r) => r.value);
      return NextResponse.json({ quotes });
    }

    if (single) {
      const quote = await getQuote(single);
      return NextResponse.json({ quote });
    }

    return NextResponse.json({ error: "Provide ?symbol= or ?symbols=" }, { status: 400 });
  } catch (err) {
    const status = err instanceof ProviderError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status });
  }
}
