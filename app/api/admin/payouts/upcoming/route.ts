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
    const date = searchParams.get('date'); // Optional: specific date to check

    // Get eligible/approved commissions (ready for payout)
    // Also include pending commissions that are past their eligible_date (they should be validated)
    const now = date ? new Date(date) : new Date();
    const eligibleCommissions = await prisma.commission.findMany({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
        status: { in: ['eligible', 'approved', 'pending'] }, // Include pending that are past eligible_date
        eligible_date: {
          lte: now, // Eligible now or by specific date
        },
      },
      include: {
        affiliate: {
          select: {
            id: true,
            name: true,
            email: true,
            payout_method: true,
            payout_identifier: true,
            paypal_email: true, // Include paypal_email for display
          },
        },
        order_attribution: {
          select: {
            shopify_order_number: true,
          },
        },
      },
      orderBy: {
        eligible_date: 'asc',
      },
    });

    // Group by affiliate
    const payoutByAffiliate = eligibleCommissions.reduce((acc, commission) => {
      const affiliateId = commission.affiliate_id;
      if (!acc[affiliateId]) {
        acc[affiliateId] = {
          affiliate_id: affiliateId,
          affiliate_name: commission.affiliate.name,
          affiliate_email: commission.affiliate.email,
          payout_method: commission.affiliate.payout_method || (commission.affiliate.paypal_email ? 'PayPal' : 'Manual'),
          payout_identifier: commission.affiliate.payout_identifier || commission.affiliate.paypal_email || null,
          total_amount: 0,
          currency: commission.currency,
          commission_count: 0,
          commissions: [],
        };
      }

      acc[affiliateId].total_amount += parseFloat(commission.amount.toString());
      acc[affiliateId].commission_count += 1;
      acc[affiliateId].commissions.push({
        id: commission.id,
        amount: commission.amount.toString(),
        order_id: commission.shopify_order_id,
        order_number: commission.order_attribution?.shopify_order_number || commission.shopify_order_id,
        eligible_date: commission.eligible_date.toISOString(),
        created_at: commission.created_at.toISOString(),
      });

      return acc;
    }, {} as Record<string, any>);

    const payouts = Object.values(payoutByAffiliate).map((p: any) => ({
      ...p,
      total_amount: p.total_amount.toFixed(2),
    }));

    // Sort by total amount (descending)
    payouts.sort((a: any, b: any) => parseFloat(b.total_amount) - parseFloat(a.total_amount));

    return NextResponse.json({
      payouts,
      total_affiliates: payouts.length,
      total_amount: eligibleCommissions.reduce(
        (sum, c) => sum + parseFloat(c.amount.toString()),
        0
      ).toFixed(2),
      total_commissions: eligibleCommissions.length,
    });
  } catch (error: any) {
    console.error('Error fetching upcoming payouts:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch upcoming payouts' },
      { status: 500 }
    );
  }
}
