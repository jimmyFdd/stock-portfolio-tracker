import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentDbUser } from "@/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Shape returned to the client — matches the `Holding` type used by the UI.
function serialize(p: {
  id: string;
  symbol: string;
  shares: number;
  buyPrice: number;
  manualPrice: number | null;
}) {
  return {
    id: p.id,
    symbol: p.symbol,
    shares: p.shares,
    buyPrice: p.buyPrice,
    manualPrice: p.manualPrice,
  };
}

async function listFor(userId: string) {
  const positions = await prisma.position.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return positions.map(serialize);
}

// GET /api/positions -> the signed-in user's positions
export async function GET() {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ positions: await listFor(user.id) });
}

// POST /api/positions  body: { symbol, shares, buyPrice }
// Adds a position; an existing ticker merges into a weighted-average cost.
export async function POST(req: NextRequest) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const symbol = String(body?.symbol ?? "").trim().toUpperCase();
  const shares = Number(body?.shares);
  const buyPrice = Number(body?.buyPrice);

  if (!symbol) return NextResponse.json({ error: "Symbol is required" }, { status: 400 });
  if (!Number.isFinite(shares) || shares <= 0)
    return NextResponse.json({ error: "Shares must be positive" }, { status: 400 });
  if (!Number.isFinite(buyPrice) || buyPrice < 0)
    return NextResponse.json({ error: "Buy price must be >= 0" }, { status: 400 });

  const existing = await prisma.position.findUnique({
    where: { userId_symbol: { userId: user.id, symbol } },
  });

  if (existing) {
    const totalShares = existing.shares + shares;
    const avg =
      (existing.shares * existing.buyPrice + shares * buyPrice) / totalShares;
    await prisma.position.update({
      where: { id: existing.id },
      data: { shares: totalShares, buyPrice: Number(avg.toFixed(4)) },
    });
  } else {
    await prisma.position.create({
      data: { userId: user.id, symbol, shares, buyPrice },
    });
  }

  return NextResponse.json({ positions: await listFor(user.id) });
}
