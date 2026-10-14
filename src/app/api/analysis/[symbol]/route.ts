import { NextRequest, NextResponse } from "next/server";
import { getDailyAnalysis, AnalysisError } from "@/lib/analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // the Claude call can take a few seconds

// GET /api/analysis/:symbol        -> today's analysis (cached if it exists)
// GET /api/analysis/:symbol?refresh=1 -> force regeneration
export async function GET(
  req: NextRequest,
  { params }: { params: { symbol: string } }
) {
  const symbol = (params.symbol ?? "").trim();
  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }
  const refresh = ["1", "true", "yes"].includes(
    (req.nextUrl.searchParams.get("refresh") ?? "").toLowerCase()
  );

  try {
    const analysis = await getDailyAnalysis(symbol, { refresh });
    return NextResponse.json(analysis);
  } catch (err) {
    const status = err instanceof AnalysisError ? err.status : 502;
    const message = err instanceof Error ? err.message : "Failed to generate analysis";
    return NextResponse.json({ error: message }, { status });
  }
}
