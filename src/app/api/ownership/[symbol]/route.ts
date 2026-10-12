import { NextRequest, NextResponse } from "next/server";
import { getOwnership } from "@/lib/ownership";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/ownership/:symbol
// Institutional ownership, top holders, and insider activity for one ticker.
export async function GET(
  _req: NextRequest,
  { params }: { params: { symbol: string } }
) {
  const symbol = (params.symbol ?? "").trim();
  if (!symbol) {
    return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  }
  try {
    const data = await getOwnership(symbol);
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load ownership";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
