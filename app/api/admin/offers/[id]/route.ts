import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * GET single offer
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

    const offer = await prisma.offer.findFirst({
      where: {
        id: params.id,
        shopify_shop_id: admin.shopify_shop_id,
      },
    });

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    return NextResponse.json({
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
        updated_at: offer.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Error fetching offer:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch offer' },
      { status: 500 }
    );
  }
}

/**
 * PATCH update offer
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const existing = await prisma.offer.findFirst({
      where: {
        id: params.id,
        shopify_shop_id: admin.shopify_shop_id,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      name,
      commission_type,
      amount,
      currency,
      commission_terms,
      attribution_window_days,
      auto_approve_affiliates,
      selling_subscriptions,
      subscription_max_payments,
      subscription_rebill_commission_type,
      subscription_rebill_commission_value,
      make_private,
      hide_referral_links,
      hide_coupon_promotion,
      enable_variable_commission,
    } = body;

    const data: Record<string, unknown> = {};
    if (name !== undefined) data.name = name;
    if (commission_type !== undefined) data.commission_type = commission_type === 'percentage' ? 'percentage' : 'flat_rate';
    if (amount !== undefined) data.amount = parseFloat(String(amount));
    if (currency !== undefined) data.currency = currency;
    if (commission_terms !== undefined) data.commission_terms = commission_terms || null;
    if (attribution_window_days !== undefined) data.attribution_window_days = parseInt(String(attribution_window_days), 10) || 90;
    if (auto_approve_affiliates !== undefined) data.auto_approve_affiliates = !!auto_approve_affiliates;
    if (selling_subscriptions !== undefined && ['no', 'credit_all', 'credit_none', 'credit_first_only'].includes(selling_subscriptions)) {
      data.selling_subscriptions = selling_subscriptions;
    }
    const sellSub = selling_subscriptions !== undefined ? selling_subscriptions : (existing as any).selling_subscriptions;
    if (selling_subscriptions !== undefined && sellSub !== 'credit_first_only') {
      data.subscription_max_payments = null;
      data.subscription_rebill_commission_type = null;
      data.subscription_rebill_commission_value = null;
    } else if (sellSub === 'credit_first_only') {
      if (subscription_max_payments !== undefined) {
        data.subscription_max_payments = subscription_max_payments != null && subscription_max_payments !== ''
          ? parseInt(String(subscription_max_payments), 10)
          : null;
      }
      if (subscription_rebill_commission_type !== undefined) {
        data.subscription_rebill_commission_type = ['flat_rate', 'percentage'].includes(subscription_rebill_commission_type)
          ? subscription_rebill_commission_type
          : null;
      }
      if (subscription_rebill_commission_value !== undefined) {
        data.subscription_rebill_commission_value = subscription_rebill_commission_value != null && subscription_rebill_commission_value !== ''
          ? parseFloat(String(subscription_rebill_commission_value))
          : null;
      }
    }
    if (make_private !== undefined) data.make_private = !!make_private;
    if (hide_referral_links !== undefined) data.hide_referral_links = !!hide_referral_links;
    if (hide_coupon_promotion !== undefined) data.hide_coupon_promotion = !!hide_coupon_promotion;
    if (enable_variable_commission !== undefined) data.enable_variable_commission = !!enable_variable_commission;

    const offer = await prisma.offer.update({
      where: { id: params.id },
      data: data as any,
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
        updated_at: offer.updated_at,
      },
    });
  } catch (error: any) {
    console.error('Error updating offer:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update offer' },
      { status: 500 }
    );
  }
}

/**
 * DELETE offer
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const offer = await prisma.offer.findFirst({
      where: {
        id: params.id,
        shopify_shop_id: admin.shopify_shop_id,
      },
    });

    if (!offer) {
      return NextResponse.json({ error: 'Offer not found' }, { status: 404 });
    }

    await prisma.offer.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Offer deleted',
    });
  } catch (error: any) {
    console.error('Error deleting offer:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete offer' },
      { status: 500 }
    );
  }
}
