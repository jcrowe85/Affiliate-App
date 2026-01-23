import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

/**
 * Create payout run or get all payout runs
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payoutRuns = await prisma.payoutRun.findMany({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
      },
      include: {
        _count: {
          select: {
            commissions: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    return NextResponse.json({
      payoutRuns: payoutRuns.map(run => ({
        id: run.id,
        period_start: run.period_start,
        period_end: run.period_end,
        status: run.status,
        payout_reference: run.payout_reference,
        commission_count: run._count.commissions,
        created_at: run.created_at,
        updated_at: run.updated_at,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching payout runs:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch payout runs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { period_start, period_end, commission_ids } = await request.json();

    if (!period_start || !period_end || !commission_ids || !Array.isArray(commission_ids)) {
      return NextResponse.json(
        { error: 'period_start, period_end, and commission_ids array are required' },
        { status: 400 }
      );
    }

    // Verify commissions belong to this shop and are eligible
    const commissions = await prisma.commission.findMany({
      where: {
        id: { in: commission_ids },
        shopify_shop_id: admin.shopify_shop_id,
        status: { in: ['eligible', 'approved'] },
      },
    });

    if (commissions.length !== commission_ids.length) {
      return NextResponse.json(
        { error: 'Some commissions not found or not eligible' },
        { status: 400 }
      );
    }

    // Create payout run
    const payoutRun = await prisma.payoutRun.create({
      data: {
        period_start: new Date(period_start),
        period_end: new Date(period_end),
        status: 'draft',
        shopify_shop_id: admin.shopify_shop_id,
        commissions: {
          create: commission_ids.map((commissionId: string) => ({
            commission_id: commissionId,
          })),
        },
      },
    });

    return NextResponse.json({
      success: true,
      payoutRun: {
        id: payoutRun.id,
        period_start: payoutRun.period_start,
        period_end: payoutRun.period_end,
        status: payoutRun.status,
        commission_count: commission_ids.length,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating payout run:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create payout run' },
      { status: 500 }
    );
  }
}