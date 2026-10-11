import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentDbUser } from "@/lib/user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function listFor(userId: string) {
  const positions = await prisma.position.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return positions.map((p) => ({
    id: p.id,
    symbol: p.symbol,
    shares: p.shares,
    buyPrice: p.buyPrice,
  }));
}

/** Confirm the position exists AND belongs to the signed-in user. */
async function ownedPosition(positionId: string, userId: string) {
  const pos = await prisma.position.findUnique({ where: { id: positionId } });
  return pos && pos.userId === userId ? pos : null;
}

// DELETE /api/positions/:id
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const pos = await ownedPosition(params.id, user.id);
  if (!pos) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.position.delete({ where: { id: pos.id } });
  return NextResponse.json({ positions: await listFor(user.id) });
}

// PATCH /api/positions/:id  body: { shares?, buyPrice? }
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentDbUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const pos = await ownedPosition(params.id, user.id);
  if (!pos) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const data: { shares?: number; buyPrice?: number } = {};
  if (body?.shares !== undefined) {
    const shares = Number(body.shares);
    if (!Number.isFinite(shares) || shares <= 0)
      return NextResponse.json({ error: "Shares must be positive" }, { status: 400 });
    data.shares = shares;
  }
  if (body?.buyPrice !== undefined) {
    const buyPrice = Number(body.buyPrice);
    if (!Number.isFinite(buyPrice) || buyPrice < 0)
      return NextResponse.json({ error: "Buy price must be >= 0" }, { status: 400 });
    data.buyPrice = buyPrice;
  }

  await prisma.position.update({ where: { id: pos.id }, data });
  return NextResponse.json({ positions: await listFor(user.id) });
}
