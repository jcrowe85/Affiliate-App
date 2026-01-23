import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

/**
 * GET all offers for the admin's shop
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const offers = await prisma.offer.findMany({
      where: { shopify_shop_id: admin.shopify_shop_id },
      orderBy: { created_at: 'desc' },
      include: {
        _count: { select: { affiliates: true } },
        affiliates: {
          select: {
            id: true,
            commissions: {
              where: { status: { not: 'reversed' } },
              select: { amount: true },
            },
          },
        },
      },
    });

    return NextResponse.json({
      offers: offers.map((o) => {
        const revenue = o.affiliates.reduce(
          (sum, a) => sum + a.commissions.reduce((s, c) => s + parseFloat(c.amount.toString()), 0),
          0
        );
        return {
          id: o.id,
          offer_number: o.offer_number,
          name: o.name,
          commission_type: o.commission_type,
          amount: o.amount.toString(),
          currency: o.currency,
          commission_terms: o.commission_terms,
          attribution_window_days: o.attribution_window_days,
          auto_approve_affiliates: o.auto_approve_affiliates,
          selling_subscriptions: o.selling_subscriptions,
          subscription_max_payments: o.subscription_max_payments,
          subscription_rebill_commission_type: o.subscription_rebill_commission_type,
          subscription_rebill_commission_value: o.subscription_rebill_commission_value?.toString() ?? null,
          make_private: o.make_private,
          hide_referral_links: o.hide_referral_links,
          hide_coupon_promotion: o.hide_coupon_promotion,
          enable_variable_commission: o.enable_variable_commission,
          created_at: o.created_at,
          affiliate_count: o._count.affiliates,
          offer_revenue: revenue.toFixed(2),
        };
      }),
    });
  } catch (error: any) {
    console.error('Error fetching offers:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch offers' },
      { status: 500 }
    );
  }
}

/**
 * POST create new offer
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      name,
      commission_type = 'flat_rate',
      amount,
      currency = 'USD',
      commission_terms,
      attribution_window_days = 90,
      auto_approve_affiliates = false,
      selling_subscriptions = 'no',
      subscription_max_payments,
      subscription_rebill_commission_type,
      subscription_rebill_commission_value,
      make_private = false,
      hide_referral_links = false,
      hide_coupon_promotion = false,
      enable_variable_commission = false,
    } = body;

    if (!name || amount == null) {
      return NextResponse.json(
        { error: 'Name and amount are required' },
        { status: 400 }
      );
    }

    const sellSub = ['no', 'credit_all', 'credit_none', 'credit_first_only'].includes(selling_subscriptions)
      ? selling_subscriptions
      : 'no';
    const useRebill = sellSub === 'credit_first_only';
    const maxPay = useRebill && subscription_max_payments != null ? parseInt(String(subscription_max_payments), 10) : null;
    const rebillType = useRebill && subscription_rebill_commission_type && ['flat_rate', 'percentage'].includes(subscription_rebill_commission_type)
      ? subscription_rebill_commission_type
      : null;
    const rebillVal = useRebill && subscription_rebill_commission_value != null && subscription_rebill_commission_value !== ''
      ? parseFloat(String(subscription_rebill_commission_value))
      : null;

    const shopId = admin.shopify_shop_id;
    const offer = await prisma.$transaction(async (tx) => {
      const agg = await tx.offer.aggregate({
        where: { shopify_shop_id: shopId },
        _max: { offer_number: true },
      });
      // Start at 29332 if no offers exist, otherwise continue from max + 1
      const nextNum = agg._max.offer_number != null ? agg._max.offer_number + 1 : 29332;
      return tx.offer.create({
        data: {
          offer_number: nextNum,
          name,
          commission_type: commission_type === 'percentage' ? 'percentage' : 'flat_rate',
          amount: parseFloat(String(amount)),
          currency: currency || 'USD',
          commission_terms: commission_terms || null,
          attribution_window_days: parseInt(String(attribution_window_days), 10) || 90,
          auto_approve_affiliates: !!auto_approve_affiliates,
          selling_subscriptions: sellSub,
          subscription_max_payments: maxPay ?? undefined,
          subscription_rebill_commission_type: rebillType ?? undefined,
          subscription_rebill_commission_value: rebillVal ?? undefined,
          make_private: !!make_private,
          hide_referral_links: !!hide_referral_links,
          hide_coupon_promotion: !!hide_coupon_promotion,
          enable_variable_commission: !!enable_variable_commission,
          shopify_shop_id: shopId,
        },
      });
    });

    return NextResponse.json({
      success: true,
      offer: {
        id: offer.id,
        offer_number: offer.offer_number,
        name: offer.name,
        commission_type: offer.commission_type,
        amount: offer.amount.toString(),
        currency: offer.currency,
        commission_terms: offer.commission_terms,
        attribution_window_days: offer.attribution_window_days,
        auto_approve_affiliates: offer.auto_approve_affiliates,
        selling_subscriptions: offer.selling_subscriptions,
        subscription_max_payments: offer.subscription_max_payments,
        subscription_rebill_commission_type: offer.subscription_rebill_commission_type,
        subscription_rebill_commission_value: offer.subscription_rebill_commission_value?.toString() ?? null,
        make_private: offer.make_private,
        hide_referral_links: offer.hide_referral_links,
        hide_coupon_promotion: offer.hide_coupon_promotion,
        enable_variable_commission: offer.enable_variable_commission,
        created_at: offer.created_at,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating offer:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create offer' },
      { status: 500 }
    );
  }
}
