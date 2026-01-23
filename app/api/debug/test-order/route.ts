import { NextRequest, NextResponse } from 'next/server';
import { getCurrentAdmin } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * Debug endpoint to check test order processing
 * 
 * Checks:
 * 1. If affiliate exists
 * 2. If clicks were recorded
 * 3. If order attribution exists
 * 4. If commission was created
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const affiliateNumber = searchParams.get('affiliate_number');
    const orderNumber = searchParams.get('order_number');
    const shopifyShopId = admin.shopify_shop_id;

    const results: any = {
      affiliateNumber,
      orderNumber,
      shopifyShopId,
      checks: {},
    };

    // Check 1: Does affiliate exist?
    if (affiliateNumber) {
      const affiliateNum = parseInt(affiliateNumber, 10);
      const affiliate = await prisma.affiliate.findFirst({
        where: {
          affiliate_number: affiliateNum,
          shopify_shop_id: shopifyShopId,
        },
        include: {
          offer: true,
        },
      });

      results.checks.affiliate = {
        exists: !!affiliate,
        data: affiliate ? {
          id: affiliate.id,
          name: affiliate.name,
          email: affiliate.email,
          status: affiliate.status,
          affiliate_number: affiliate.affiliate_number,
          has_offer: !!affiliate.offer,
          offer_name: affiliate.offer?.name,
        } : null,
      };

      // Check 2: Were clicks recorded?
      if (affiliate) {
        const clicks = await prisma.click.findMany({
          where: {
            affiliate_id: affiliate.id,
            shopify_shop_id: shopifyShopId,
          },
          orderBy: {
            created_at: 'desc',
          },
          take: 10,
        });

        results.checks.clicks = {
          count: clicks.length,
          recent: clicks.map(c => ({
            id: c.id,
            created_at: c.created_at,
            landing_url: c.landing_url,
          })),
        };
      }
    }

    // Check 3: Order attribution
    if (orderNumber) {
      const orderAttribution = await prisma.orderAttribution.findFirst({
        where: {
          shopify_order_number: orderNumber,
          shopify_shop_id: shopifyShopId,
        },
        include: {
          affiliate: {
            include: {
              offer: true,
            },
          },
          click: true,
        },
      });

      results.checks.orderAttribution = {
        exists: !!orderAttribution,
        data: orderAttribution ? {
          id: orderAttribution.id,
          shopify_order_id: orderAttribution.shopify_order_id,
          shopify_order_number: orderAttribution.shopify_order_number,
          affiliate_id: orderAttribution.affiliate_id,
          affiliate_name: orderAttribution.affiliate.name,
          affiliate_number: orderAttribution.affiliate.affiliate_number,
          attribution_type: orderAttribution.attribution_type,
          created_at: orderAttribution.created_at,
          has_click: !!orderAttribution.click,
          click_id: orderAttribution.click_id,
        } : null,
      };

      // Check 4: Commission
      if (orderAttribution) {
        const commission = await prisma.commission.findFirst({
          where: {
            order_attribution_id: orderAttribution.id,
            shopify_shop_id: shopifyShopId,
          },
        });

        results.checks.commission = {
          exists: !!commission,
          data: commission ? {
            id: commission.id,
            amount: commission.amount.toString(),
            currency: commission.currency,
            status: commission.status,
            created_at: commission.created_at,
          } : null,
        };
      }
    }

    // Check 5: Recent orders (last 10)
    const recentOrders = await prisma.orderAttribution.findMany({
      where: {
        shopify_shop_id: shopifyShopId,
      },
      orderBy: {
        created_at: 'desc',
      },
      take: 10,
      include: {
        affiliate: true,
      },
    });

    results.checks.recentOrders = {
      count: recentOrders.length,
      orders: recentOrders.map(o => ({
        shopify_order_number: o.shopify_order_number,
        affiliate_number: o.affiliate.affiliate_number,
        affiliate_name: o.affiliate.name,
        created_at: o.created_at,
        attribution_type: o.attribution_type,
      })),
    };

    return NextResponse.json(results);
  } catch (error: any) {
    console.error('Debug endpoint error:', error);
    return NextResponse.json(
      { error: error.message || 'Debug check failed' },
      { status: 500 }
    );
  }
}
