import { NextRequest, NextResponse } from "next/server";
import { getChipDistribution } from "@/lib/chip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // TDCC fetch + AI interpretation can take a few seconds

// GET /api/chip-distribution/:symbol        -> today's snapshot (cached)
// GET /api/chip-distribution/:symbol?refresh=1 -> force a fresh pull
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
    const data = await getChipDistribution(symbol, { refresh });
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load chip distribution";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
