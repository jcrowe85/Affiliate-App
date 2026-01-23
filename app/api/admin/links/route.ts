import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getCurrentAdmin } from '@/lib/auth';

/**
 * Get all affiliate links
 */
export async function GET(request: NextRequest) {
  try {
    const admin = await getCurrentAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const affiliateId = searchParams.get('affiliate_id');

    const where: any = {
      shopify_shop_id: admin.shopify_shop_id,
    };

    if (affiliateId) {
      where.affiliate_id = affiliateId;
    }

    const links = await prisma.affiliateLink.findMany({
      where,
      include: {
        affiliate: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            clicks: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    const appUrl = process.env.SHOPIFY_APP_URL || 'http://localhost:3000';

    return NextResponse.json({
      links: links.map(link => ({
        id: link.id,
        affiliate_id: link.affiliate_id,
        affiliate_name: link.affiliate.name,
        affiliate_email: link.affiliate.email,
        destination_url: link.destination_url,
        campaign_name: link.campaign_name,
        coupon_code: link.coupon_code,
        click_url: `${appUrl}/api/click?affiliate_id=${link.affiliate_id}&link_id=${link.id}&url=${encodeURIComponent(link.destination_url)}&shop=${admin.shopify_shop_id}.myshopify.com`,
        clicks: link._count.clicks,
        created_at: link.created_at,
      })),
    });
  } catch (error: any) {
    console.error('Error fetching links:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch links' },
      { status: 500 }
    );
  }
}