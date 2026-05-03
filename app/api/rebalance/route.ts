import { NextResponse } from 'next/server';
import { runRebalance } from '@/lib/rebalancer';
import { hasDatabase, prisma } from '@/lib/db';
import { createAlert } from '@/lib/alerts';
import { getUserIdOrDevFallback } from '@/lib/server-auth';

export async function GET() {
  const userId = await getUserIdOrDevFallback();
  if (!userId) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  try {
    const report = await runRebalance(userId);

    if (hasDatabase) {
      await prisma.rebalanceHistory.create({
        data: { userId, report: JSON.stringify(report) },
      });
    }

    const urgentCount = report.review.filter((r) => r.urgency === 'high').length;
    if (urgentCount > 0) {
      await createAlert({
        userId,
        type: 'REBALANCE_DUE',
        title: 'Portfolio Rebalancing Required',
        message: `${urgentCount} urgent + ${report.review.length - urgentCount} review items. Trim ${report.trim.length} overweight positions.`,
        severity: 'high',
      });
    }

    return NextResponse.json(report);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
