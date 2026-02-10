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

    // Get affiliate performance stats
    const affiliateStats = await prisma.affiliate.findMany({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
        status: 'active',
      },
      include: {
        _count: {
          select: {
            clicks: true,
            orders: true,
            commissions: true,
          },
        },
      },
    });

    // Fetch commissions separately to avoid conflicts
    const affiliateIds = affiliateStats.map(a => a.id);
    const allCommissions = await prisma.commission.findMany({
      where: {
        affiliate_id: { in: affiliateIds },
        shopify_shop_id: admin.shopify_shop_id,
      },
      select: {
        affiliate_id: true,
        amount: true,
        status: true,
        currency: true,
      },
    });

    // Group commissions by affiliate_id
    const commissionsByAffiliate = new Map<string, typeof allCommissions>();
    allCommissions.forEach(commission => {
      const existing = commissionsByAffiliate.get(commission.affiliate_id) || [];
      existing.push(commission);
      commissionsByAffiliate.set(commission.affiliate_id, existing);
    });

    // Calculate performance metrics for each affiliate
    const performance = affiliateStats.map(affiliate => {
      const commissions = commissionsByAffiliate.get(affiliate.id) || [];
      
      const totalCommissions = commissions
        .filter(c => c.status !== 'reversed')
        .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);
      
      const paidCommissions = commissions
        .filter(c => c.status === 'paid')
        .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);
      
      const pendingCommissions = commissions
        .filter(c => c.status === 'eligible' || c.status === 'approved')
        .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);

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
    return NextResponse.json(
      { error: error.message || 'Failed to fetch affiliate performance' },
      { status: 500 }
    );
  }
}