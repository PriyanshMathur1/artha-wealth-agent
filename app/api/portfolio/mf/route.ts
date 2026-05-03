import { NextRequest, NextResponse } from 'next/server';
import { hasDatabase, prisma } from '@/lib/db';
import { deleteLocalMf, getLocalMfs, upsertLocalMf } from '@/lib/local-portfolio-store';
import { getUserIdOrDevFallback } from '@/lib/server-auth';

export async function GET() {
  const userId = await getUserIdOrDevFallback();
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const holdings = hasDatabase
    ? await prisma.mFHolding.findMany({ where: { userId }, orderBy: { schemeName: 'asc' } })
    : (await getLocalMfs(userId)).sort((a, b) => a.schemeName.localeCompare(b.schemeName));
  return NextResponse.json(holdings);
}

export async function POST(req: NextRequest) {
  const userId = await getUserIdOrDevFallback();
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const body = await req.json() as {
    schemeCode: string; schemeName: string; amcName?: string;
    category?: string; units: number; avgNav: number; investedAmount?: number;
  };
  const { schemeCode, schemeName, units, avgNav } = body;
  if (!schemeCode || !schemeName || !units || !avgNav) {
    return NextResponse.json({ error: 'schemeCode, schemeName, units, avgNav are required' }, { status: 400 });
  }

  const holding = hasDatabase
    ? await (async () => {
        const existing = await prisma.mFHolding.findFirst({ where: { userId, schemeCode }, select: { id: true } });
        return existing
          ? prisma.mFHolding.update({
              where: { id: existing.id },
              data: { units, avgNav, investedAmount: body.investedAmount ?? units * avgNav },
            })
          : prisma.mFHolding.create({
              data: { userId, schemeCode, schemeName, amcName: body.amcName ?? '', category: body.category ?? 'Equity', units, avgNav, investedAmount: body.investedAmount ?? units * avgNav },
            });
      })()
    : await upsertLocalMf(userId, {
        schemeCode,
        schemeName,
        amcName: body.amcName ?? '',
        category: body.category ?? 'Equity',
        units,
        avgNav,
        investedAmount: body.investedAmount ?? units * avgNav,
        buyDate: new Date().toISOString(),
      });

  return NextResponse.json(holding, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const userId = await getUserIdOrDevFallback();
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '0');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (hasDatabase) {
    await prisma.mFHolding.deleteMany({ where: { id, userId } });
  } else {
    await deleteLocalMf(userId, id);
  }
  return NextResponse.json({ ok: true });
}
