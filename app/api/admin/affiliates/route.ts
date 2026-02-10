import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin, hashPassword } from '@/lib/auth';

// Mark route as dynamic to prevent static analysis during build
export const dynamic = 'force-dynamic';

/**
 * Get all affiliates or create new affiliate
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const affiliates = await prisma.affiliate.findMany({
      where: {
        shopify_shop_id: admin.shopify_shop_id,
      },
      include: {
        offer: true,
        affiliate_offers: {
          include: {
            offer: true,
          },
        },
        _count: {
          select: {
            links: true,
            clicks: true,
            orders: true,
            commissions: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // Get commission aggregates for all affiliates in one query to avoid loading all commission records
    const affiliateIds = affiliates.map(a => a.id);
    const commissionAggregates = affiliateIds.length > 0
      ? await prisma.commission.groupBy({
          by: ['affiliate_id', 'status', 'currency'],
          where: {
            affiliate_id: { in: affiliateIds },
            shopify_shop_id: admin.shopify_shop_id,
          },
          _sum: {
            amount: true,
          },
          _count: {
            id: true,
          },
        })
      : [];

    // Group aggregates by affiliate_id
    const aggregatesByAffiliate = new Map<string, { 
      revenue: number; 
      currency: string; 
      pendingCount: number;
    }>();
    
    commissionAggregates.forEach(agg => {
      const existing = aggregatesByAffiliate.get(agg.affiliate_id) || { 
        revenue: 0, 
        currency: 'USD', 
        pendingCount: 0 
      };
      const amount = parseFloat(agg._sum.amount?.toString() || '0');
      
      if (agg.status === 'paid' || agg.status === 'approved') {
        existing.revenue += amount;
      }
      if (agg.status === 'pending') {
        existing.pendingCount += agg._count.id;
      }
      if (!existing.currency && agg.currency) {
        existing.currency = agg.currency;
      }
      
      aggregatesByAffiliate.set(agg.affiliate_id, existing);
    });

    return NextResponse.json({
      affiliates: affiliates.map(a => {
        const aggregates = aggregatesByAffiliate.get(a.id) || { 
          revenue: 0, 
          currency: 'USD', 
          pendingCount: 0 
        };
        
        // Calculate total orders
        const totalOrders = a._count.orders;

        // Calculate AOV (Average Order Value)
        // Note: OrderAttribution doesn't store order total, so we'll use commission amounts as proxy
        // For a more accurate AOV, we'd need to fetch order data from Shopify or store it in OrderAttribution
        const aov = 0; // Placeholder - would need order total data

        // Get offer name
        const primaryOffer = a.offer?.name || '—';

        return {
          id: a.id,
          affiliate_number: a.affiliate_number,
          name: a.name,
          first_name: a.first_name,
          last_name: a.last_name,
          company: a.company,
          email: a.email,
          paypal_email: a.paypal_email,
          address_line1: a.address_line1,
          address_line2: a.address_line2,
          city: a.city,
          state: a.state,
          zip: a.zip,
          phone: a.phone,
          source: a.source,
          status: a.status,
          payout_method: a.payout_method,
          payout_identifier: a.payout_identifier,
          payout_terms_days: a.payout_terms_days,
          merchant_id: a.merchant_id,
          offer_id: a.offer_id,
          webhook_url: a.webhook_url,
          webhook_parameter_mapping: a.webhook_parameter_mapping,
          redirect_base_url: a.redirect_base_url,
          offer: a.offer ? { id: a.offer.id, name: a.offer.name } : null,
          offers: a.affiliate_offers.map(ao => ({
            id: ao.offer.id,
            name: ao.offer.name,
            offer_number: ao.offer.offer_number,
          })),
          created_at: a.created_at,
          stats: {
            links: a._count.links,
            clicks: a._count.clicks,
            orders: totalOrders,
            commissions: a._count.commissions,
            revenue: aggregates.revenue,
            currency: aggregates.currency,
            aov,
            pending_conversions: aggregates.pendingCount,
          },
        };
      }),
    });
  } catch (error: any) {
    console.error('Error fetching affiliates:', error);
    console.error('Error stack:', error.stack);
    console.error('Error details:', JSON.stringify(error, null, 2));
    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch affiliates',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      first_name,
      last_name,
      company,
      email,
      paypal_email,
      address_line1,
      address_line2,
      city,
      state,
      zip,
      phone,
      source,
      offer_id,
      password,
      merchant_id,
      status = 'active',
      payout_terms_days = 30,
      webhook_url,
      webhook_parameter_mapping,
      redirect_base_url,
    } = body;

    if (!first_name?.trim() || !last_name?.trim()) {
      return NextResponse.json(
        { error: 'First name and last name are required' },
        { status: 400 }
      );
    }
    if (!email?.trim()) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }
    // Validate that an offer is provided
    if (!offer_id || offer_id.trim() === '') {
      return NextResponse.json(
        { error: 'An offer is required' },
        { status: 400 }
      );
    }
    if (!password?.trim()) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }
    const emailNorm = email.trim().toLowerCase();
    const existingEmail = await prisma.affiliate.findUnique({
      where: { email: emailNorm },
    });
    if (existingEmail) {
      return NextResponse.json(
        { error: 'Affiliate with this email already exists' },
        { status: 400 }
      );
    }

    // Check merchant_id uniqueness only if provided
    if (merchant_id?.trim()) {
      const existingMerchant = await prisma.affiliate.findFirst({
        where: {
          shopify_shop_id: admin.shopify_shop_id,
          merchant_id: merchant_id.trim(),
        },
      });
      if (existingMerchant) {
        return NextResponse.json(
          { error: 'Merchant ID already in use' },
          { status: 400 }
        );
      }
    }

    const password_hash = await hashPassword(password);
    const name = `${first_name.trim()} ${last_name.trim()}`;
    const shopId = admin.shopify_shop_id;

    // Generate affiliate_number starting from 30483
    const affiliate = await prisma.$transaction(async (tx) => {
      const agg = await tx.affiliate.aggregate({
        where: { shopify_shop_id: shopId },
        _max: { affiliate_number: true },
      });
      // Start at 30483 if no affiliates exist, otherwise continue from max + 1
      const nextNum = agg._max.affiliate_number != null ? agg._max.affiliate_number + 1 : 30483;

      return tx.affiliate.create({
        data: {
          affiliate_number: nextNum,
          name,
          first_name: first_name.trim(),
          last_name: last_name.trim(),
          company: company?.trim() || null,
          email: emailNorm,
          paypal_email: paypal_email?.trim() || null,
          address_line1: address_line1?.trim() || null,
          address_line2: address_line2?.trim() || null,
          city: city?.trim() || null,
          state: state?.trim() || null,
          zip: zip?.trim() || null,
          phone: phone?.trim() || null,
          source: source?.trim() || null,
          status,
          payout_method: paypal_email?.trim() ? 'paypal' : null,
          payout_identifier: paypal_email?.trim() || null,
          payout_terms_days,
          password_hash,
          merchant_id: merchant_id?.trim() || null,
          offer_id: offer_id.trim(),
          webhook_url: webhook_url?.trim() || null,
          webhook_parameter_mapping: webhook_parameter_mapping || null,
          redirect_base_url: redirect_base_url?.trim() || null,
          shopify_shop_id: shopId,
        },
      });
    });

    return NextResponse.json({
      success: true,
      affiliate: {
        id: affiliate.id,
        name: affiliate.name,
        first_name: affiliate.first_name,
        last_name: affiliate.last_name,
        company: affiliate.company,
        email: affiliate.email,
        paypal_email: affiliate.paypal_email,
        address_line1: affiliate.address_line1,
        address_line2: affiliate.address_line2,
        city: affiliate.city,
        state: affiliate.state,
        zip: affiliate.zip,
        phone: affiliate.phone,
        status: affiliate.status,
        merchant_id: affiliate.merchant_id,
        offer_id: affiliate.offer_id,
        affiliate_number: affiliate.affiliate_number,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating affiliate:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create affiliate' },
      { status: 500 }
    );
  }
}