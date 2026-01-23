import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/admin/conversions/[id]
 * Get detailed conversion information including subscription payments
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

    const commissionId = params.id;

    // Get commission with all related data
    const commission = await prisma.commission.findUnique({
      where: {
        id: commissionId,
        shopify_shop_id: admin.shopify_shop_id,
      },
      include: {
        affiliate: {
          include: {
            offer: true,
          },
        },
        order_attribution: {
          include: {
            click: true,
          },
        },
      },
    });

    if (!commission) {
      return NextResponse.json({ error: 'Conversion not found' }, { status: 404 });
    }

    // Get subscription attribution if this is a subscription order
    const subscriptionAttribution = await prisma.subscriptionAttribution.findFirst({
      where: {
        original_order_id: commission.shopify_order_id,
        affiliate_id: commission.affiliate_id,
        shopify_shop_id: admin.shopify_shop_id,
      },
    });

    // Get all commissions for this subscription (initial + rebills)
    let subscriptionCommissions: any[] = [];
    if (subscriptionAttribution) {
      // Find all orders attributed to this affiliate with the same subscription
      const allSubscriptionOrders = await prisma.orderAttribution.findMany({
        where: {
          affiliate_id: commission.affiliate_id,
          shopify_shop_id: admin.shopify_shop_id,
        },
        include: {
          commissions: {
            where: {
              shopify_shop_id: admin.shopify_shop_id,
            },
            orderBy: {
              created_at: 'asc',
            },
          },
        },
        orderBy: {
          created_at: 'asc',
        },
      });

      // Filter to only orders that match this subscription (by checking if they're related)
      // For now, we'll get all commissions for orders from this customer/affiliate
      // You may want to refine this based on how you track subscription renewals
      subscriptionCommissions = allSubscriptionOrders
        .flatMap((oa) => oa.commissions)
        .filter((c) => c.id !== commissionId); // Exclude current commission
    }

    // Calculate subscription payment summary
    const offer = commission.affiliate.offer;
    const isSubscription = offer?.selling_subscriptions && offer.selling_subscriptions !== 'no';
    const maxPayments = subscriptionAttribution?.max_payments || offer?.subscription_max_payments || null;
    const paymentsMade = subscriptionAttribution?.payments_made || 0;
    const totalPaymentsExpected = maxPayments ? maxPayments + 1 : null; // +1 for initial payment
    const paymentsRemaining = totalPaymentsExpected ? Math.max(0, totalPaymentsExpected - paymentsMade - 1) : null; // -1 because initial is already counted

    // Calculate totals
    const totalCommissionPaid = subscriptionCommissions
      .filter((c) => c.status === 'paid')
      .reduce((sum, c) => sum + parseFloat(c.amount.toString()), parseFloat(commission.amount.toString()));

    const totalCommissionPending = subscriptionCommissions
      .filter((c) => ['pending', 'eligible', 'approved'].includes(c.status))
      .reduce((sum, c) => sum + parseFloat(c.amount.toString()), 0);

    const response = {
      conversion: {
        id: commission.id,
        shopify_order_id: commission.shopify_order_id,
        shopify_order_number: commission.order_attribution.shopify_order_number,
        customer_email: commission.order_attribution.customer_email || '',
        customer_name: commission.order_attribution.customer_name || '',
        order_total: commission.order_attribution.order_total?.toString() || '0',
        order_currency: commission.order_attribution.order_currency || 'USD',
        order_date: commission.order_attribution.created_at.toISOString(),
        affiliate: {
          id: commission.affiliate.id,
          name: commission.affiliate.first_name && commission.affiliate.last_name
            ? `${commission.affiliate.first_name} ${commission.affiliate.last_name}`.trim()
            : commission.affiliate.name,
          email: commission.affiliate.email,
          affiliate_number: commission.affiliate.affiliate_number,
        },
        offer: {
          id: offer?.id || null,
          name: offer?.name || null,
          offer_number: offer?.offer_number || null,
          commission_type: offer?.commission_type || null,
          amount: offer?.amount?.toString() || null,
          selling_subscriptions: offer?.selling_subscriptions || null,
          subscription_max_payments: offer?.subscription_max_payments || null,
          subscription_rebill_commission_type: offer?.subscription_rebill_commission_type || null,
          subscription_rebill_commission_value: offer?.subscription_rebill_commission_value?.toString() || null,
        },
        commission: {
          amount: commission.amount.toString(),
          currency: commission.currency,
          status: commission.status,
          created_at: commission.created_at.toISOString(),
          eligible_date: commission.eligible_date.toISOString(),
        },
        attribution: {
          type: commission.order_attribution.attribution_type,
          click_id: commission.order_attribution.click_id,
        },
        subscription: subscriptionAttribution
          ? {
              id: subscriptionAttribution.id,
              original_order_id: subscriptionAttribution.original_order_id,
              selling_plan_id: subscriptionAttribution.selling_plan_id,
              interval_months: subscriptionAttribution.interval_months,
              max_payments: subscriptionAttribution.max_payments,
              payments_made: subscriptionAttribution.payments_made,
              active: subscriptionAttribution.active,
              created_at: subscriptionAttribution.created_at.toISOString(),
            }
          : null,
        subscription_summary: isSubscription
          ? {
              is_subscription: true,
              max_payments: maxPayments,
              payments_made: paymentsMade,
              total_payments_expected: totalPaymentsExpected,
              payments_remaining: paymentsRemaining,
              total_commission_paid: totalCommissionPaid.toFixed(2),
              total_commission_pending: totalCommissionPending.toFixed(2),
            }
          : {
              is_subscription: false,
            },
        subscription_commissions: subscriptionCommissions.map((c) => ({
          id: c.id,
          shopify_order_id: c.shopify_order_id,
          amount: c.amount.toString(),
          currency: c.currency,
          status: c.status,
          created_at: c.created_at.toISOString(),
        })),
      },
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error fetching conversion details:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch conversion details' },
      { status: 500 }
    );
  }
}
