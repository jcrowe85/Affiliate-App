import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // Get paid payout runs
    const payoutRuns = await prisma.payoutRun.findMany({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
        status: 'paid',
      },
      include: {
        commissions: {
          include: {
            commission: {
              include: {
                affiliate: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    paypal_email: true,
                  },
                },
                order_attribution: {
                  select: {
                    shopify_order_number: true,
                  },
                },
              },
            },
          },
        },
        _count: {
          select: {
            commissions: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      take: limit,
      skip: offset,
    });

    const paidPayouts = payoutRuns.map(run => {
      const totalAmount = run.commissions.reduce(
        (sum, pc) => sum + parseFloat(pc.commission.amount.toString()),
        0
      );
      const currency = run.commissions[0]?.commission.currency || 'USD';
      const affiliate = run.commissions[0]?.commission.affiliate;

      return {
        id: run.id,
        affiliate_id: affiliate?.id || '',
        affiliate_name: affiliate?.name || 'Unknown',
        affiliate_email: affiliate?.email || '',
        paypal_email: affiliate?.paypal_email || null,
        total_amount: totalAmount.toFixed(2),
        currency,
        commission_count: run._count.commissions,
        payout_reference: run.payout_reference,
        paypal_batch_id: (run as any).paypal_batch_id || null,
        paypal_status: (run as any).paypal_status || null,
        payout_method: (run as any).payout_method || 'manual',
        period_start: run.period_start.toISOString(),
        period_end: run.period_end.toISOString(),
        created_at: run.created_at.toISOString(),
        updated_at: run.updated_at.toISOString(),
        commissions: run.commissions.map(pc => ({
          id: pc.commission.id,
          order_number: pc.commission.order_attribution?.shopify_order_number || pc.commission.shopify_order_id,
          amount: pc.commission.amount.toString(),
          currency: pc.commission.currency,
          created_at: pc.commission.created_at.toISOString(),
        })),
      };
    });

    // Get total count for pagination
    const totalCount = await prisma.payoutRun.count({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
        status: 'paid',
      },
    });

    return NextResponse.json({
      payouts: paidPayouts,
      total: totalCount,
      limit,
      offset,
    });
  } catch (error: any) {
    console.error('Error fetching paid payouts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch paid payouts' },
      { status: 500 }
    );
  }
}
