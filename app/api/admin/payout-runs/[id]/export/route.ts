import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

/**
 * Export payout run as CSV
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payoutRun = await prisma.payoutRun.findFirst({
      where: {
        id: params.id,
        shopify_shop_id: admin.shopify_shop_id,
      },
      include: {
        commissions: {
          include: {
            commission: {
              include: {
                affiliate: {
                  select: {
                    name: true,
                    email: true,
                    payout_method: true,
                    payout_identifier: true,
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
      },
    });

    if (!payoutRun) {
      return NextResponse.json(
        { error: 'Payout run not found' },
        { status: 404 }
      );
    }

    // Generate CSV
    const headers = [
      'Affiliate Name',
      'Affiliate Email',
      'Payout Method',
      'Payout Identifier',
      'Order Number',
      'Commission Amount',
      'Currency',
      'Commission ID',
    ];

    const rows = payoutRun.commissions.map(pc => {
      const c = pc.commission;
      return [
        c.affiliate.name,
        c.affiliate.email,
        c.affiliate.payout_method || '',
        c.affiliate.payout_identifier || '',
        c.order_attribution.shopify_order_number,
        c.amount.toString(),
        c.currency,
        c.id,
      ];
    });

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="payout_run_${payoutRun.id}_${Date.now()}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('Error exporting payout run:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to export payout run' },
      { status: 500 }
    );
  }
}