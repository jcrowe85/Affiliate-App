import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Get affiliate performance ranking
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');

    // Get affiliate performance stats - using same pattern as /api/admin/affiliates
    const affiliateStats = await prisma.affiliate.findMany({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
        status: 'active',
      },
      include: {
        commissions: {
          select: {
            amount: true,
            status: true,
            currency: true,
          },
        },
        _count: {
          select: {
            clicks: true,
            orders: true,
            commissions: true,
          },
        },
      },
    });

    // Calculate performance metrics for each affiliate
    const performance = affiliateStats.map(affiliate => {
      const totalCommissions = affiliate.commissions
        .filter(c => c.status !== 'reversed')
        .reduce((sum, c) => sum + parseFloat(String(c.amount)), 0);
      
      const paidCommissions = affiliate.commissions
        .filter(c => c.status === 'paid')
        .reduce((sum, c) => sum + parseFloat(String(c.amount)), 0);
      
      const pendingCommissions = affiliate.commissions
        .filter(c => c.status === 'eligible' || c.status === 'approved')
        .reduce((sum, c) => sum + parseFloat(String(c.amount)), 0);

      const orders = affiliate._count.orders;
      const clicks = affiliate._count.clicks;
      const conversionRate = clicks > 0 ? (orders / clicks) * 100 : 0;

      return {
        affiliate_id: affiliate.id,
        name: affiliate.name,
        email: affiliate.email,
        clicks,
        orders,
        conversion_rate: conversionRate.toFixed(2),
        total_commission: totalCommissions.toFixed(2),
        paid_commission: paidCommissions.toFixed(2),
        pending_commission: pendingCommissions.toFixed(2),
        total_commissions_count: affiliate._count.commissions,
      };
    });

    // Sort by total commission (descending)
    performance.sort((a, b) => parseFloat(b.total_commission) - parseFloat(a.total_commission));

    return NextResponse.json({
      affiliates: performance.slice(0, limit),
      total: performance.length,
    });
  } catch (error: any) {
    console.error('Error fetching affiliate performance:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch affiliate performance',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}