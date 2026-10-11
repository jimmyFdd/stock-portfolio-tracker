import { NextRequest, NextResponse } from "next/server";
import { searchSymbols, ProviderError } from "@/lib/provider";

export const runtime = "nodejs";

// GET /api/search?q=apple  -> symbol autocomplete matches
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 1) {
    return NextResponse.json({ matches: [] });
  }
  try {
    const matches = await searchSymbols(q);
    return NextResponse.json({ matches });
  } catch (err) {
    const status = err instanceof ProviderError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status });
  }
}
