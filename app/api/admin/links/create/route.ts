import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

/**
 * Create affiliate link (per product, collection, or custom URL)
 */
export async function POST(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { affiliate_id, destination_url, campaign_name, coupon_code } = await request.json();

    if (!affiliate_id || !destination_url) {
      return NextResponse.json(
        { error: 'affiliate_id and destination_url are required' },
        { status: 400 }
      );
    }

    // Verify affiliate exists and belongs to this shop
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        id: affiliate_id,
        shopify_shop_id: admin.shopify_shop_id,
      },
    });

    if (!affiliate) {
      return NextResponse.json(
        { error: 'Affiliate not found' },
        { status: 404 }
      );
    }

    // Create affiliate link
    const link = await prisma.affiliateLink.create({
      data: {
        affiliate_id,
        destination_url,
        campaign_name: campaign_name || null,
        coupon_code: coupon_code || null,
        shopify_shop_id: admin.shopify_shop_id,
      },
    });

    // Generate the actual click tracking URL
    const appUrl = process.env.SHOPIFY_APP_URL || 'http://localhost:3000';
    const clickUrl = `${appUrl}/api/click?affiliate_id=${affiliate_id}&link_id=${link.id}&url=${encodeURIComponent(destination_url)}&shop=${admin.shopify_shop_id}.myshopify.com`;

    return NextResponse.json({
      success: true,
      link: {
        id: link.id,
        affiliate_id: link.affiliate_id,
        destination_url: link.destination_url,
        campaign_name: link.campaign_name,
        coupon_code: link.coupon_code,
        click_url: clickUrl, // The URL affiliates should use
        created_at: link.created_at,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating affiliate link:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create affiliate link' },
      { status: 500 }
    );
  }
}