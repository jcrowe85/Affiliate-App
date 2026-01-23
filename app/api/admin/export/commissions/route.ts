import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Export commissions as CSV
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status'); // optional filter
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');

    const where: any = {
      shopify_shop_id: admin.shopify_shop_id,
    };

    if (status) {
      where.status = status;
    }

    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) where.created_at.gte = new Date(startDate);
      if (endDate) where.created_at.lte = new Date(endDate);
    }

    const commissions = await prisma.commission.findMany({
      where,
      include: {
        affiliate: {
          select: {
            name: true,
            email: true,
          },
        },
        order_attribution: {
          select: {
            shopify_order_number: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // Generate CSV
    const headers = [
      'Commission ID',
      'Affiliate Name',
      'Affiliate Email',
      'Order Number',
      'Amount',
      'Currency',
      'Status',
      'Eligible Date',
      'Created At',
    ];

    const rows = commissions.map(c => [
      c.id,
      c.affiliate.name,
      c.affiliate.email,
      c.order_attribution.shopify_order_number,
      c.amount.toString(),
      c.currency,
      c.status,
      c.eligible_date.toISOString(),
      c.created_at.toISOString(),
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="commissions_${Date.now()}.csv"`,
      },
    });
  } catch (error: any) {
    console.error('Error exporting commissions:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to export commissions' },
      { status: 500 }
    );
  }
}