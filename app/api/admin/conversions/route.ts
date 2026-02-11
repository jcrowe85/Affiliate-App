import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/conversions
 * Fetch conversions (commissions) with order details
 * Supports filtering by affiliate, offer, date range, status
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const affiliateId = searchParams.get('affiliate_id');
    const offerId = searchParams.get('offer_id');
    const status = searchParams.get('status'); // commission status
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const search = searchParams.get('search'); // Search by order number, customer email, etc.

    const where: any = {
      shopify_shop_id: admin.shopify_shop_id,
    };

    // Filter by affiliate
    if (affiliateId) {
      where.affiliate_id = affiliateId;
    }

    // Filter by offer (through affiliate)
    if (offerId) {
      where.affiliate = {
        offer_id: offerId,
      };
    }

    // Filter by commission status
    if (status) {
      where.status = status;
    }

    // Filter by date range
    if (startDate || endDate) {
      where.created_at = {};
      if (startDate) {
        where.created_at.gte = new Date(startDate);
      }
      if (endDate) {
        where.created_at.lte = new Date(endDate);
      }
    }

    // Search by order number, customer email, or customer name (through order_attribution)
    if (search) {
      where.OR = [
        { order_attribution: { shopify_order_number: { contains: search, mode: 'insensitive' } } },
        { order_attribution: { customer_email: { contains: search, mode: 'insensitive' } } },
        { order_attribution: { customer_name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const commissions = await prisma.commission.findMany({
      where,
      include: {
        affiliate: {
          select: {
            id: true,
            name: true,
            first_name: true,
            last_name: true,
            email: true,
            affiliate_number: true,
            offer: true,
          },
        },
        order_attribution: {
          include: {
            click: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
      take: 1000, // Limit to 1000 results
    });

    // Get subscription attributions for all commissions
    const orderIds = commissions.map((c) => c.shopify_order_id);
    const subscriptions = await prisma.subscriptionAttribution.findMany({
      where: {
        original_order_id: { in: orderIds },
        shopify_shop_id: admin.shopify_shop_id,
      },
    });

    const subscriptionMap = new Map(
      subscriptions.map((s) => [s.original_order_id, s])
    );

    // Format response
    const conversions = commissions.map((commission) => {
      const subscription = subscriptionMap.get(commission.shopify_order_id);
      const offer = commission.affiliate.offer;
      const isSubscription = offer?.selling_subscriptions && offer.selling_subscriptions !== 'no';
      
      return {
        id: commission.id,
        shopify_order_id: commission.shopify_order_id,
        shopify_order_number: commission.order_attribution?.shopify_order_number || '',
        customer_email: commission.order_attribution?.customer_email || '',
        customer_name: commission.order_attribution?.customer_name || '',
        order_total: commission.order_attribution?.order_total?.toString() || '0',
        order_currency: commission.order_attribution?.order_currency || 'USD',
        affiliate_id: commission.affiliate_id,
        affiliate_name: commission.affiliate.first_name && commission.affiliate.last_name
          ? `${commission.affiliate.first_name} ${commission.affiliate.last_name}`.trim()
          : commission.affiliate.name,
        affiliate_email: commission.affiliate.email,
        affiliate_number: commission.affiliate.affiliate_number,
        offer_id: offer?.id || null,
        offer_name: offer?.name || null,
        offer_number: offer?.offer_number || null,
        commission_amount: commission.amount.toString(),
        commission_currency: commission.currency,
        commission_status: commission.status,
        attribution_type: commission.order_attribution?.attribution_type || 'link',
        created_at: commission.created_at.toISOString(),
        eligible_date: commission.eligible_date.toISOString(),
        is_subscription: isSubscription,
        subscription_payments_made: subscription?.payments_made || 0,
        subscription_max_payments: subscription?.max_payments || offer?.subscription_max_payments || null,
      };
    });

    return NextResponse.json({ conversions });
  } catch (error: any) {
    console.error('Error fetching conversions:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch conversions',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
